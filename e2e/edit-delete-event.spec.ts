import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test("un organisateur modifie puis supprime son evenement", async ({ page }) => {
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

    await page.getByRole("link", { name: "Créer un événement" }).click();
    const title = `Fete a modifier ${Date.now()}`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    // Depuis la page événement, aller sur "Modifier"
    await page.getByText(title).click();
    await expect(page).toHaveURL(/\/e\/.+/);
    await page.getByRole("link", { name: "Modifier", exact: true }).click();
    await expect(page).toHaveURL(/\/modifier$/);

    // Le formulaire est bien pré-rempli avec les valeurs existantes
    await expect(page.getByPlaceholder("L'anniversaire de Julie")).toHaveValue(title);

    const newTitle = `${title} modifie`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(newTitle);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();

    // Retour sur la page événement, avec le nouveau titre
    await expect(page).toHaveURL(/\/e\/.+/);
    await expect(page).not.toHaveURL(/\/modifier$/);
    await expect(page.getByRole("heading", { name: newTitle })).toBeVisible();

    const { data: eventAfterEdit } = await supabaseAdmin
      .from("events")
      .select("id, title")
      .eq("title", newTitle)
      .maybeSingle();
    expect(eventAfterEdit?.title).toBe(newTitle);

    // Suppression (annulation), avec confirmation
    await page.getByRole("button", { name: "Supprimer l'événement" }).click();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);
    await expect(page.getByText(newTitle)).not.toBeVisible();

    const { data: eventAfterDelete } = await supabaseAdmin
      .from("events")
      .select("status")
      .eq("id", eventAfterEdit!.id)
      .maybeSingle();
    expect(eventAfterDelete?.status).toBe("cancelled");

    await supabaseAdmin.from("events").delete().eq("id", eventAfterEdit!.id);
  } finally {
    await deleteTestUser(user.id);
  }
});

// Retour Thomas : "dans modifier, à côté de suivant et enregistrer, je veux
// une croix dans une bulle rouge et ça ramène à l'accueil" -- quitter le
// wizard sans enregistrer, uniquement en édition (une croix qui ramènerait à
// "l'accueil" n'aurait pas de sens en création, l'événement n'existe pas
// encore).
test("la croix du wizard Modifier annule et revient à l'événement sans enregistrer", async ({
  page,
}) => {
  const email = `e2e-cancel-wizard-${Date.now()}@example.com`;
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

    const title = `Fete annulation wizard ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    // Jamais affichée en création : quitter n'aurait nulle part de sensé où
    // aller tant que l'événement n'existe pas encore.
    await expect(
      page.getByRole("link", { name: "Annuler et revenir à l'événement" }),
    ).not.toBeVisible();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 5, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    await page.getByText(title).click();
    await expect(page).toHaveURL(/\/e\/.+/);
    await page.getByRole("link", { name: "Modifier", exact: true }).click();
    await expect(page).toHaveURL(/\/modifier$/);

    await page.getByPlaceholder("L'anniversaire de Julie").fill(`${title} jamais enregistre`);
    await page.getByRole("link", { name: "Annuler et revenir à l'événement" }).click();

    await expect(page).toHaveURL(new RegExp(`/e/.+`));
    await expect(page).not.toHaveURL(/\/modifier$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const { data: eventUnchanged } = await supabaseAdmin
      .from("events")
      .select("id, title")
      .eq("title", title)
      .maybeSingle();
    expect(eventUnchanged?.title).toBe(title);

    await supabaseAdmin.from("events").delete().eq("id", eventUnchanged!.id);
  } finally {
    await deleteTestUser(user.id);
  }
});
