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
    await page.getByLabel("Ton numéro de téléphone").fill("+32470000099");
    await page.getByLabel("Une femme").check();
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
