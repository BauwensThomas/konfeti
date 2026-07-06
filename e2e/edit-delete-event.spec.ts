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
    await page.getByLabel("Ton numéro de téléphone").fill("+32470000099");
    await page.getByLabel("Une femme").check();
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
    await page.getByRole("link", { name: "Modifier" }).click();
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
