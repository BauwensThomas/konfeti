import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test("un visiteur sans compte (porte 2) renseigne son identite et voit l'ecran d'attente, puis recupere sa place depuis un autre appareil via son code", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-hote-invite-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let firstGuestUserId: string | null = null;
  let secondGuestUserId: string | null = null;
  let eventId: string | null = null;

  try {
    await page.goto("/profil/completer");
    await page.getByLabel("Ton numéro de téléphone").fill("+32470000097");
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    await page.getByRole("link", { name: "Créer un événement" }).click();
    const title = `Fete invite ${Date.now()}`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 3, 1000 Bruxelles");
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

    // Un premier visiteur, sans compte, ouvre le lien directement (contexte
    // navigateur neuf, sans aucun cookie de session).
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    try {
      await guestPage.goto(`/e/${event.short_code}`);
      await expect(guestPage.getByRole("heading", { name: title })).toBeVisible();

      await guestPage.getByRole("button", { name: "Continuer sans compte" }).click();
      await guestPage.getByPlaceholder("Julie").fill("Marc");
      await guestPage.getByPlaceholder("Dean").fill("Untel");
      await guestPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000096");
      await guestPage.getByLabel("Un homme").check();
      await guestPage.getByRole("button", { name: "Avatar 1" }).click();
      await guestPage.getByLabel("Je viens !").check();
      await guestPage.getByRole("button", { name: "Envoyer ma réponse" }).click();

      await expect(guestPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
        timeout: 10_000,
      });

      const { data: rsvp } = await supabaseAdmin
        .from("rsvps")
        .select("id, profile_id, status, guest_code, first_name, last_name")
        .eq("event_id", event.id)
        .maybeSingle();

      expect(rsvp?.status).toBe("pending");
      expect(rsvp?.first_name).toBe("Marc");
      expect(rsvp?.last_name).toBe("Untel");
      expect(rsvp?.guest_code).toMatch(/^[A-Z]+-[A-Z0-9]{6}$/);
      firstGuestUserId = rsvp!.profile_id;

      // Récupération cross-device : un deuxième appareil (contexte neuf) saisit
      // le code et récupère la même participation (brief 1.2).
      const recoveryContext = await browser.newContext();
      const recoveryPage = await recoveryContext.newPage();

      try {
        await recoveryPage.goto(`/e/${event.short_code}`);
        await recoveryPage.getByRole("button", { name: "J'ai déjà un code" }).click();
        await recoveryPage.getByPlaceholder("MOT-XXXXXX").fill(rsvp!.guest_code!);
        await recoveryPage.getByRole("button", { name: "Retrouver ma place" }).click();

        await expect(
          recoveryPage.getByText("Ta demande est chez l'organisateur !"),
        ).toBeVisible({ timeout: 10_000 });

        const { data: rsvpAfter } = await supabaseAdmin
          .from("rsvps")
          .select("id, profile_id")
          .eq("event_id", event.id)
          .maybeSingle();

        // Toujours la même ligne de participation, mais rattachée à la
        // session du nouvel appareil.
        expect(rsvpAfter?.id).toBe(rsvp!.id);
        expect(rsvpAfter?.profile_id).not.toBe(firstGuestUserId);
        secondGuestUserId = rsvpAfter!.profile_id;
      } finally {
        await recoveryContext.close();
      }
    } finally {
      await guestContext.close();
    }
  } finally {
    if (eventId) {
      await supabaseAdmin.from("events").delete().eq("id", eventId);
    }
    if (firstGuestUserId) await deleteTestUser(firstGuestUserId);
    if (secondGuestUserId) await deleteTestUser(secondGuestUserId);
    await deleteTestUser(host.id);
  }
});
