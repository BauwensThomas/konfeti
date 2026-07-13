import { test, expect } from "@playwright/test";

// Menu "Informations" du footer (retour Thomas : "j'aimerais juste au-dessus
// de Konfeti - 2026 - Belgacai un titre, et quand on clic dessus ça ouvre un
// popup avec les differentes lien des pages et un lien vers profils") --
// ouvert en feuille ancrée en bas d'écran ("comme un menu qui se déroule
// mais inversé"), regroupe les 4 pages légales + le profil. Le contenu de
// ces pages vit désormais dans messages/fr.json (retour Thomas : "mettre
// tout les cgu etc dans fr.json pour modifier par après dans les autres
// langues"), vérifié ici en s'assurant que chaque page affiche bien son
// titre et un extrait de son contenu traduit.
test("le menu Informations du footer ouvre un popup avec les 4 pages legales + le profil, chacune affiche son contenu", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Informations" })).toBeVisible();

  const links: { name: string; url: RegExp; heading: string; excerpt: string }[] = [
    {
      name: "Politique de confidentialité",
      url: /\/confidentialite$/,
      heading: "Politique de confidentialité",
      excerpt: "Konfeti est un projet BelgaCai.",
    },
    {
      name: "Conditions générales d'utilisation",
      url: /\/cgu$/,
      heading: "Conditions générales d'utilisation",
      excerpt: "Vous devez créer un compte (e-mail ou Google) pour utiliser Konfeti",
    },
    {
      name: "Gérer les cookies",
      url: /\/cookies$/,
      heading: "Gérer les cookies",
      excerpt: "Konfeti utilise un seul cookie",
    },
    {
      name: "Mentions légales",
      url: /\/mentions-legales$/,
      heading: "Mentions légales",
      excerpt: "hébergés par Vercel Inc.",
    },
  ];

  for (const link of links) {
    await page.getByRole("button", { name: "Informations" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Informations", { exact: true })).toBeVisible();
    await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    await dialog.getByRole("link", { name: link.name }).click();
    await expect(page).toHaveURL(link.url);
    await expect(page.getByRole("heading", { name: link.heading })).toBeVisible();
    await expect(page.getByText(link.excerpt, { exact: false })).toBeVisible();
    // Régression : ces pages mentionnaient autrefois un mécanisme de session
    // temporaire aujourd'hui retiré (seul un vrai compte existe désormais).
    await expect(page.getByText("session anonyme", { exact: false })).not.toBeVisible();
  }

  // Le lien vers le profil, lui aussi regroupé dans ce menu.
  await page.getByRole("button", { name: "Informations" }).click();
  const profileDialog = page.getByRole("dialog");
  await profileDialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await profileDialog.getByRole("link", { name: "Mon profil" }).click();
  await expect(page).toHaveURL(/\/connexion/);
});

test("la page Gerer les cookies propose un bouton pour supprimer le cookie de session", async ({ page }) => {
  await page.goto("/cookies");
  await expect(page.getByRole("heading", { name: "Gérer les cookies" })).toBeVisible();
  await expect(page.getByText("Konfeti utilise un seul cookie", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Supprimer mes cookies" }).click();
  await expect(page).toHaveURL(/\/$/);
});
