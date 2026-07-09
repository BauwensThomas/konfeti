import path from "node:path";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test("un organisateur complete son profil et cree un evenement", async ({ page }) => {
  const email = `e2e-organisateur-${Date.now()}@example.com`;
  const user = await loginAs(page, email);

  try {
    // Complétion du profil (obligatoire, brief 1.2)
    await page.goto("/profil/completer");
    await page.getByPlaceholder("Julie").fill("Hôte");
    await page.getByPlaceholder("Dean").fill("Test");
    await page.getByLabel("Ton numéro de téléphone").fill("+32470000099");
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    // Depuis Mes événements, aucun événement au départ
    await expect(page.getByText("Aucun événement pour l'instant")).toBeVisible();

    // Création d'un événement (wizard)
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await expect(page).toHaveURL(/\/creer$/);

    const title = `Fete de test e2e ${Date.now()}`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, "fixtures", "test-photo.png"));
    await expect(page.getByText("Envoi en cours...")).toBeHidden({ timeout: 10_000 });
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();

    await expect(page).toHaveURL(/\/mes-evenements$/);
    await expect(page.getByText(title)).toBeVisible();

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, title, host_id, cover_photo_path")
      .eq("title", title)
      .maybeSingle();
    expect(event?.host_id).toBe(user.id);
    expect(event?.cover_photo_path).toBeTruthy();

    // La carte de l'événement mène bien vers sa page (brief 4.2)
    await page.getByText(title).click();
    await expect(page).toHaveURL(/\/e\/.+/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("Tu es l'organisateur")).toBeVisible();
    await expect(page.getByText("Rue de Test 1, 1000 Bruxelles")).toBeVisible();

    // La photo de couverture uploadée dans le wizard s'affiche dans la bannière
    const bannerPhoto = page.locator(`img[src*="${process.env.NEXT_PUBLIC_SUPABASE_URL}"]`);
    await expect(bannerPhoto).toBeVisible();

    // Cliquer sur la photo depuis la page événement ouvre directement un
    // popup Changer/Supprimer (pas besoin de repasser par le wizard)
    await bannerPhoto.click();
    await expect(page.getByRole("button", { name: "Supprimer la photo" })).toBeVisible();
    await page.getByRole("button", { name: "Supprimer la photo" }).click();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();
    await expect(bannerPhoto).toBeHidden();

    if (event) {
      const { data: eventAfterPhotoDelete } = await supabaseAdmin
        .from("events")
        .select("cover_photo_path")
        .eq("id", event.id)
        .maybeSingle();
      expect(eventAfterPhotoDelete?.cover_photo_path).toBeNull();

      await supabaseAdmin.from("events").delete().eq("id", event.id);
    }
  } finally {
    await deleteTestUser(user.id);
  }
});
