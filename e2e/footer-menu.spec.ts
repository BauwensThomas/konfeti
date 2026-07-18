import { test, expect } from "@playwright/test";
import { loginAs, deleteTestUser } from "./helpers/auth";

// Retour Thomas : "on a mis aucun bouton se déconnecter ce n'est pas grave ?"
// -- vrai manque, la seule voie avant passait par "Gérer les cookies" (effet
// de bord d'un bouton RGPD, jamais pensé comme une vraie déconnexion).
// "Se déconnecter" n'a de sens qu'avec une session active (voir Footer.tsx).
test("footer : bouton Se déconnecter absent sans session, présent et fonctionnel une fois connecté", async ({
  page,
}) => {
  await page.goto("/connexion");
  await page.getByRole("button", { name: "Informations" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Se déconnecter" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const email = `e2e-footer-logout-${Date.now()}@example.com`;
  let userId: string | null = null;

  try {
    const user = await loginAs(page, email);
    userId = user.id;

    await page.getByRole("button", { name: "Informations" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Se déconnecter" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Se déconnecter" }).click();

    // Session bien coupée : une route protégée renvoie vers la connexion.
    await page.goto("/mes-evenements");
    await expect(page).toHaveURL(/\/connexion/);
  } finally {
    if (userId) await deleteTestUser(userId);
  }
});
