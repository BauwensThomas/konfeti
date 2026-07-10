import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Retour Thomas : un invité "code d'accès" (session anonyme) promu admin a
// les mêmes droits que celui qui a créé l'événement -- mais en pratique,
// modifier l'événement échouait pour lui ("Oups, quelque chose s'est mal
// passé", aucune modification enregistrée). Diagnostiqué via un log serveur
// temporaire : `updateEvent` (et cancelEvent/updateEventCoverPhoto/
// voteDateOption/finalizeDatePoll) bloquaient `user.is_anonymous`
// inconditionnellement -- un blocage pertinent pour `createEvent` (créer un
// événement exige un vrai compte), mais copié à tort sur des actions d'admin
// ordinaires que RLS (`is_event_admin`) autorise déjà pour quiconque a le
// rôle admin, session anonyme ou non.
test("un admin promu en session anonyme peut modifier l'événement", async ({ page, browser }) => {
  const hostEmail = `e2e-anon-admin-host-${Date.now()}@example.com`;
  let hostId: string | null = null;
  let eventId: string | null = null;
  let guestProfileId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail);
    hostId = host.id;

    const title = `E2E anon admin ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 12, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, short_code")
      .eq("title", title)
      .maybeSingle();
    if (!event) throw new Error("evenement introuvable");
    eventId = event.id;

    // Marc rejoint SANS compte (session anonyme "code d'accès").
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/e/${event.short_code}`);
    await guestPage.getByRole("button", { name: "Continuer sans compte" }).click();
    await guestPage.getByPlaceholder("Julie").fill("Marc");
    await guestPage.getByPlaceholder("Dean").fill("Untel");
    await guestPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000087");
    await guestPage.getByLabel("Un homme").check();
    await guestPage.getByRole("button", { name: "Avatar 3" }).click();
    await guestPage.getByLabel("Je viens !").check();
    await guestPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(guestPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    const { data: guestRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Marc")
      .maybeSingle();
    guestProfileId = guestRsvp!.profile_id;

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await page.getByRole("combobox").first().selectOption("admin");

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("rsvps")
          .select("role")
          .eq("event_id", event.id)
          .eq("profile_id", guestRsvp!.profile_id)
          .single();
        return data?.role;
      })
      .toBe("admin");

    // Marc (toujours anonyme) modifie l'événement.
    await guestPage.goto(`/e/${event.short_code}/modifier`);
    const newTitle = `${title} modifie par Marc`;
    await guestPage.getByPlaceholder("L'anniversaire de Julie").fill(newTitle);
    await guestPage.getByRole("button", { name: "Suivant" }).click();
    await guestPage.getByRole("button", { name: "Suivant" }).click();
    await guestPage.getByRole("button", { name: "Suivant" }).click();
    await guestPage.getByRole("button", { name: "Suivant" }).click();
    await guestPage.getByRole("button", { name: "Enregistrer les modifications" }).click();

    await expect(guestPage).toHaveURL(new RegExp(`/e/${event.short_code}$`));
    await expect(guestPage.getByRole("heading", { name: newTitle })).toBeVisible();

    const { data: eventAfter } = await supabaseAdmin
      .from("events")
      .select("title")
      .eq("id", event.id)
      .single();
    expect(eventAfter?.title).toBe(newTitle);

    await guestContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (hostId) await deleteTestUser(hostId);
    if (guestProfileId) await deleteTestUser(guestProfileId);
  }
});
