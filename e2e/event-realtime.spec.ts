import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Retour Thomas : une modification faite via le wizard "Modifier" doit se
// refléter automatiquement chez tout le monde déjà sur la page événement,
// sans qu'ils aient besoin de recharger (règle transverse posée dans
// DECISIONS.md, ici appliquée à la table `events` elle-même, jusque-là
// absente de la publication Realtime -- voir migration
// 20260710001700_events_table_realtime.sql).
test("changer 'qui peut partager le lien' depuis Modifier se répercute en direct chez un invité déjà sur la page", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-event-realtime-host-${Date.now()}@example.com`;
  const guestEmail = `e2e-event-realtime-guest-${Date.now()}@example.com`;
  let hostId: string | null = null;
  let guestId: string | null = null;
  let eventId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail);
    hostId = host.id;

    const title = `E2E realtime ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 7, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, short_code, share_policy")
      .eq("title", title)
      .maybeSingle();
    if (!event) throw new Error("evenement introuvable");
    eventId = event.id;
    expect(event.share_policy).toBe("all");

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    const guest = await loginAs(guestPage, guestEmail, `/e/${event.short_code}`);
    guestId = guest.id;
    await guestPage.getByPlaceholder("Julie").fill("Marc");
    await guestPage.getByPlaceholder("Dean").fill("Untel");
    await guestPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000096");
    await guestPage.getByLabel("Un homme").check();
    await guestPage.getByRole("button", { name: "Avatar 3" }).click();
    await guestPage.getByLabel("Je viens !").check();
    await guestPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(guestPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();

    await guestPage.reload();
    // Politique par défaut "tout le monde" : l'invité (non-admin) voit déjà
    // la bulle Partager.
    await expect(guestPage.getByRole("button", { name: "Partager" })).toBeVisible({
      timeout: 10_000,
    });

    // L'hôte restreint le partage aux admins seulement, via le wizard.
    await page.goto(`/e/${event.short_code}/modifier`);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Les admins seulement" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${event.short_code}$`));

    // La page de l'invité, restée ouverte SANS reload manuel, doit perdre la
    // bulle Partager automatiquement (Realtime sur la table `events`).
    await expect(guestPage.getByRole("button", { name: "Partager" })).not.toBeVisible({
      timeout: 10_000,
    });

    await guestContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (hostId) await deleteTestUser(hostId);
    if (guestId) await deleteTestUser(guestId);
  }
});
