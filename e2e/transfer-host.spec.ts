import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Retour Thomas : "je dois le quitter [l'événement] que si il y a un autre
// administrateur" -- host_id est une colonne fixe sur `events`, jamais
// transférée jusqu'ici, donc l'hôte ne pouvait jamais utiliser le circuit
// normal "Quitter l'événement" (toujours masqué pour lui, voir page.tsx).
// Décision retenue (question posée à Thomas) : un transfert EXPLICITE de
// l'organisation vers un autre admin déjà approuvé, avant de pouvoir quitter.
test("l'hôte transfère l'organisation à un admin promu, puis peut quitter l'événement", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-transfer-host-${Date.now()}@example.com`;
  const guestEmail = `e2e-transfer-guest-${Date.now()}@example.com`;
  let hostId: string | null = null;
  let guestId: string | null = null;
  let eventId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail);
    hostId = host.id;

    const title = `E2E transfer host ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 10, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, short_code, host_id")
      .eq("title", title)
      .maybeSingle();
    if (!event) throw new Error("evenement introuvable");
    eventId = event.id;
    expect(event.host_id).toBe(hostId);

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    const guest = await loginAs(guestPage, guestEmail, `/e/${event.short_code}`);
    guestId = guest.id;
    await guestPage.getByPlaceholder("Julie").fill("Marc");
    await guestPage.getByPlaceholder("Dean").fill("Untel");
    await guestPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000089");
    await guestPage.getByLabel("Un homme").check();
    await guestPage.getByRole("button", { name: "Avatar 3" }).click();
    await guestPage.getByLabel("Je viens !").check();
    await guestPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(guestPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    // Avant promotion : l'hôte voit le badge organisateur, pas le bouton
    // "Quitter" (jamais affiché à l'hôte, voir MyParticipationCard/page.tsx).
    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText("Tu es l'organisateur")).toBeVisible();
    await expect(page.getByRole("button", { name: "Quitter l'événement" })).not.toBeVisible();

    await page.getByRole("button", { name: "Personnes" }).click();
    // Retour Thomas : "dans les personnes, je suis marqué comme
    // administrateur et pas organisateur" -- la liste Personnes doit, elle
    // aussi, distinguer l'hôte actuel d'un simple admin promu.
    await expect(page.getByText("Organisateur")).toBeVisible();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await page.getByRole("combobox").first().selectOption("admin");

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("rsvps")
          .select("role")
          .eq("event_id", event.id)
          .eq("profile_id", guestId)
          .single();
        return data?.role;
      })
      .toBe("admin");

    // L'hôte transfère l'organisation vers Marc (désormais admin).
    await page.getByRole("button", { name: "Transférer l'organisation" }).click();
    await page.getByRole("button", { name: "Oui, transférer" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("events").select("host_id").eq("id", event.id).single();
        return data?.host_id;
      })
      .toBe(guestId);

    // Marc devient organisateur (badge visible chez lui, plus chez l'ancien hôte).
    await guestPage.goto(`/e/${event.short_code}`);
    await expect(guestPage.getByText("Tu es l'organisateur")).toBeVisible();

    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText("Tu es l'organisateur")).not.toBeVisible();

    // Dans Personnes aussi : Marc devient "Organisateur", l'ancien hôte
    // redescend à "Administrateur".
    await page.getByRole("button", { name: "Personnes" }).click();
    await expect(page.getByText("Marc Untel")).toBeVisible();
    const marcRow = page.locator("li", { hasText: "Marc Untel" });
    await expect(marcRow.getByText("Organisateur")).toBeVisible();
    const hostRow = page.locator("li").filter({ hasText: "Administrateur" });
    await expect(hostRow).toBeVisible();

    // L'ancien hôte, redevenu un admin comme un autre, peut maintenant quitter
    // (bouton sur l'onglet Accueil, pas Personnes).
    await page.getByRole("button", { name: "Accueil" }).click();
    await expect(page.getByRole("button", { name: "Quitter l'événement" })).toBeVisible();
    await page.getByRole("button", { name: "Quitter l'événement" }).click();
    await page.getByRole("button", { name: "Oui, quitter" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("rsvps")
          .select("status")
          .eq("event_id", event.id)
          .eq("profile_id", hostId)
          .single();
        return data?.status;
      })
      .toBe("left");

    await guestContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (hostId) await deleteTestUser(hostId);
    if (guestId) await deleteTestUser(guestId);
  }
});
