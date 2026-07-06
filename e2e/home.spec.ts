import { test, expect } from "@playwright/test";

test("la page d'accueil affiche le titre Konfeti", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Konfeti" })).toBeVisible();
});
