import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Retour Thomas : "dans le profil il faut pouvoir cocher ou décocher de
// recevoir les mails." Réglage global sur `profiles.wants_reminders` (actif
// par défaut, retour Thomas explicite), cascadé immédiatement sur toutes les
// participations `approved` en cours -- sinon basculer ce réglage n'aurait
// aucun effet sur les rappels déjà programmés par le cron.
test("le reglage rappels par email du profil est actif par defaut et se repercute sur les participations approuvees", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const hostEmail = `e2e-reminder-pref-host-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete reglage rappels ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 26, 1000 Bruxelles");
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

    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    const marc = await loginAs(marcPage, `marc-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    marcId = marc.id;
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000083");
    await marcPage.getByLabel("Un homme").check();
    await marcPage.getByRole("button", { name: "Avatar 1" }).click();
    await marcPage.getByLabel("Je viens !").check();
    // La case par événement (GuestIdentityForm) n'est jamais pré-cochée
    // (choix délibéré, distinct du réglage global testé ici) -- on ne la
    // touche pas.
    await marcPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(marcPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({ timeout: 10_000 });

    const { data: marcRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id")
      .eq("event_id", event.id)
      .eq("first_name", "Marc")
      .maybeSingle();

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("approved");

    // Réglage actif par défaut (retour Thomas explicite) dès /profil.
    await marcPage.goto("/profil");
    const toggle = marcPage.getByLabel("Je veux recevoir des rappels par email avant mes événements");
    await expect(toggle).toBeChecked();

    // Décoché : répercuté sur `profiles` ET sur la participation approuvée.
    await toggle.uncheck();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("profiles").select("wants_reminders").eq("id", marcId!).single();
        return data?.wants_reminders;
      })
      .toBe(false);
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("wants_reminders").eq("id", marcRsvp!.id).single();
        return data?.wants_reminders;
      })
      .toBe(false);

    // Recoché : de nouveau répercuté des deux côtés.
    await toggle.check();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("profiles").select("wants_reminders").eq("id", marcId!).single();
        return data?.wants_reminders;
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("wants_reminders").eq("id", marcRsvp!.id).single();
        return data?.wants_reminders;
      })
      .toBe(true);

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});
