import { test, expect } from "@playwright/test";

test("la page d'accueil affiche le titre Konfeti", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Konfeti" })).toBeVisible();
});

// Retour Thomas : "cache pour le moment" -- fiche Play Store pas encore
// publiée, le lien doit être totalement absent (pas juste remplacé par un
// texte) tant que PLAY_STORE_PUBLISHED n'est pas "true" (voir .env.local).
// Ce test suppose la variable vide/absente (comportement par défaut) --
// passe volontairement si elle a été mise à "true" localement pour tester
// l'autre état, aucune assertion sur l'état inverse ici.
test("le lien Play Store est totalement absent tant que PLAY_STORE_PUBLISHED n'est pas activé", async ({ page }) => {
  test.skip(process.env.PLAY_STORE_PUBLISHED === "true", "PLAY_STORE_PUBLISHED=true en local, état inverse en cours de test");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Ou télécharger l'application sur le Play Store ici" })).not.toBeVisible();
  await expect(page.getByText("Play Store")).not.toBeVisible();
});
