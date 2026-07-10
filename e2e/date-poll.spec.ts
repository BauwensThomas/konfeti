import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test("un organisateur vote pour plusieurs dates puis valide celle qui est retenue", async ({
  page,
}) => {
  const email = `e2e-organisateur-${Date.now()}@example.com`;
  const user = await loginAs(page, email);

  try {
    await page.goto("/profil/completer");
    await page.getByPlaceholder("Julie").fill("Hôte");
    await page.getByPlaceholder("Dean").fill("Test");
    await page.getByLabel("Ton numéro de téléphone").fill("+32470000099");
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    // Création d'un événement en mode sondage de date
    await page.getByRole("link", { name: "Créer un événement" }).click();
    const title = `Fete sondage ${Date.now()}`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.getByRole("button", { name: "On vote pour la date" }).click();
    const dateInputs = page.locator('input[type="datetime-local"]');
    await dateInputs.nth(0).fill("2026-12-24T20:00");
    await dateInputs.nth(1).fill("2026-12-31T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    await page.getByText(title).click();
    await expect(page).toHaveURL(/\/e\/.+/);

    // Voter pour les deux dates proposées
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.nth(0).check();
    await expect(page.getByText("1 vote").first()).toBeVisible();
    await checkboxes.nth(1).check();
    await expect(page.getByText("1 vote")).toHaveCount(2);

    // Décocher la première date
    await checkboxes.nth(0).uncheck();
    await expect(page.getByText("Aucun vote")).toBeVisible();
    await expect(checkboxes.nth(1)).toBeChecked();
    // Attendre que le vote précédent soit bien retombé (case à nouveau activable)
    // avant d'enchaîner sur la validation, pour éviter toute course avec le
    // Server Action encore en cours.
    await expect(checkboxes.nth(0)).toBeEnabled();

    const { data: eventRow } = await supabaseAdmin
      .from("events")
      .select("id, date_mode")
      .eq("title", title)
      .maybeSingle();
    expect(eventRow?.date_mode).toBe("poll");

    // L'admin (l'hôte) valide la deuxième date proposée
    await page.getByRole("button", { name: "Valider cette date" }).nth(1).click();
    const confirmButton = page.getByRole("button", { name: "Oui, valider" });
    await expect(confirmButton).toBeVisible();
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.getByText("31 décembre 2026")).toBeVisible();

    // Sondage plutôt qu'une lecture immédiate : en mode dev (Turbopack), le
    // premier appel à un Server Action pas encore compilé peut prendre
    // plusieurs secondes avant que la réponse n'arrive au navigateur, même
    // si le serveur a déjà traité la requête de son côté.
    let eventAfter: { date_mode: string; starts_at: string } | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data } = await supabaseAdmin
        .from("events")
        .select("date_mode, starts_at")
        .eq("id", eventRow!.id)
        .maybeSingle();
      if (data?.date_mode === "fixed") {
        eventAfter = data;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(eventAfter?.date_mode).toBe("fixed");
    expect(new Date(eventAfter!.starts_at).toISOString().slice(0, 10)).toBe("2026-12-31");

    await supabaseAdmin.from("events").delete().eq("id", eventRow!.id);
  } finally {
    await deleteTestUser(user.id);
  }
});

// Retour Thomas : "un admin ne peut pas valider la date, est-ce normal ?" --
// bug réel trouvé en creusant : `isAdmin={isHost}` (page.tsx) au lieu de la
// vraie variable `isAdmin` (host OU admin promu), donc "Valider cette date"
// n'apparaissait jamais que pour l'hôte littéral, jamais un admin promu.
test("un admin promu (pas l'hôte) peut aussi valider la date retenue", async ({ page, browser }) => {
  const hostEmail = `e2e-datepoll-host-${Date.now()}@example.com`;
  const adminEmail = `e2e-datepoll-admin-${Date.now()}@example.com`;
  let hostId: string | null = null;
  let adminId: string | null = null;
  let eventId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail);
    hostId = host.id;

    const title = `Fete sondage admin ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.getByRole("button", { name: "On vote pour la date" }).click();
    const dateInputs = page.locator('input[type="datetime-local"]');
    await dateInputs.nth(0).fill("2026-12-24T20:00");
    await dateInputs.nth(1).fill("2026-12-31T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 2, 1000 Bruxelles");
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

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const admin = await loginAs(adminPage, adminEmail, `/e/${event.short_code}`);
    adminId = admin.id;
    await adminPage.getByPlaceholder("Julie").fill("Marc");
    await adminPage.getByPlaceholder("Dean").fill("Untel");
    await adminPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000086");
    await adminPage.getByLabel("Un homme").check();
    await adminPage.getByRole("button", { name: "Avatar 2" }).click();
    await adminPage.getByLabel("Je viens !").check();
    await adminPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(adminPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

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
          .eq("profile_id", adminId)
          .single();
        return data?.role;
      })
      .toBe("admin");

    await adminPage.goto(`/e/${event.short_code}`);
    await expect(adminPage.getByRole("button", { name: "Valider cette date" }).first()).toBeVisible();
    await adminPage.getByRole("button", { name: "Valider cette date" }).nth(1).click();
    await adminPage.getByRole("button", { name: "Oui, valider" }).click();
    await expect(adminPage.getByText("31 décembre 2026")).toBeVisible();

    await adminContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (hostId) await deleteTestUser(hostId);
    if (adminId) await deleteTestUser(adminId);
  }
});
