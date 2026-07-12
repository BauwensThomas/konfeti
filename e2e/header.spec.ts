import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function createTestEvent(page: import("@playwright/test").Page, title: string) {
  await page.getByRole("link", { name: "Créer un événement" }).click();
  await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
  await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
  await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 6, 1000 Bruxelles");
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
  return event;
}

test("header : logo toujours visible, flèche retour masquée sur la home", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Aller à l'accueil Konfeti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retour" })).not.toBeVisible();

  // Sur une sous-page (ex. /connexion), la flèche retour doit apparaître.
  await page.goto("/connexion");
  await expect(page.getByRole("link", { name: "Aller à l'accueil Konfeti" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();
});

test("header : flèche retour masquée sur l'onboarding obligatoire /profil/completer", async ({
  page,
}) => {
  const email = `e2e-header-onboarding-${Date.now()}@example.com`;
  let userId: string | null = null;

  try {
    const user = await loginAs(page, email, "/profil/completer");
    userId = user.id;
    await expect(page).toHaveURL(/\/profil\/completer$/);
    await expect(page.getByRole("button", { name: "Retour" })).not.toBeVisible();
  } finally {
    if (userId) await deleteTestUser(userId);
  }
});

test("header : flèche retour va toujours vers /mes-evenements", async ({ page }) => {
  // Retour Thomas : "c'est mieux de revenir sur les événements non ?" --
  // destination fixe plutôt que router.back(), qui peut renvoyer vers
  // n'importe quelle page selon l'historique réel du navigateur (voir
  // DECISIONS.md, ex. un invité ayant déjà visité plusieurs événements dans
  // le même onglet).
  await page.goto("/");
  await page.goto("/connexion");
  await expect(page.getByRole("button", { name: "Retour" })).toBeVisible();
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page).toHaveURL(/\/mes-evenements/);
});

test("header : flèche retour va sur /mes-evenements même en arrivant directement (lien partagé)", async ({
  page,
}) => {
  const email = `e2e-header-fallback-${Date.now()}@example.com`;
  let userId: string | null = null;

  try {
    const host = await loginAs(page, email);
    userId = host.id;
    const title = `E2E header fallback ${Date.now()}`;
    const event = await createTestEvent(page, title);

    // Nouvel onglet du même contexte (même session/cookies) qui ouvre
    // directement le lien de l'événement -- aucun historique de navigation
    // préalable dans cet onglet, exactement comme un lien partagé cliqué
    // depuis une autre app.
    const freshPage = await page.context().newPage();
    await freshPage.goto(`/e/${event.short_code}`);
    await freshPage.getByRole("button", { name: "Retour" }).click();
    await expect(freshPage).toHaveURL(/\/mes-evenements$/);
    await freshPage.close();
  } finally {
    if (userId) await deleteTestUser(userId);
  }
});

test("header : avatar visible et mène à /profil pour une session connectée, absent sans session", async ({
  page,
}) => {
  const email = `e2e-header-avatar-${Date.now()}@example.com`;
  let userId: string | null = null;

  try {
    const user = await loginAs(page, email);
    userId = user.id;
    await expect(page.getByRole("link", { name: "Mon profil", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Mon profil", exact: true }).click();
    await expect(page).toHaveURL(/\/profil$/);

    // Sans session (ex. après deconnexion), l'avatar ne doit plus apparaître.
    await page.context().clearCookies();
    await page.goto("/connexion");
    await expect(page.getByRole("link", { name: "Mon profil", exact: true })).not.toBeVisible();
  } finally {
    if (userId) await deleteTestUser(userId);
  }
});

test("header : accès au profil masqué sur la home même avec une session active", async ({
  page,
}) => {
  // Retour Thomas : "/" est une page d'information publique avant lancement,
  // ça n'a pas de sens d'y exposer l'accès au profil, même connecté.
  const email = `e2e-header-home-hidden-${Date.now()}@example.com`;
  let userId: string | null = null;

  try {
    const user = await loginAs(page, email);
    userId = user.id;
    await expect(page.getByRole("link", { name: "Mon profil", exact: true })).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Mon profil", exact: true })).not.toBeVisible();

    // Repasser sur une page de l'app confirme que ce n'est pas cassé partout.
    await page.goto("/mes-evenements");
    await expect(page.getByRole("link", { name: "Mon profil", exact: true })).toBeVisible();
  } finally {
    if (userId) await deleteTestUser(userId);
  }
});

test("header : le logo remonte d'un cran dans la hierarchie (evenement -> Mes evenements -> landing), toujours la landing si pas connecte", async ({
  page,
}) => {
  // Retour Thomas : "quand je suis dans un evenement, si je clic sur le
  // logo... je dois arriver sur ma page de mes evenements et pas sur la
  // page d'accueil" -- puis, precise plus tot, sur "Mes evenements"
  // lui-meme le logo ramene a la landing (rien de plus "haut" dans l'app a
  // ce niveau).
  const logo = page.getByRole("link", { name: "Aller à l'accueil Konfeti" });

  // Pas connecte : toujours la landing.
  await page.goto("/connexion");
  await logo.click();
  await expect(page).toHaveURL(/\/$/);

  const email = `e2e-header-logo-hierarchy-${Date.now()}@example.com`;
  let userId: string | null = null;

  try {
    const user = await loginAs(page, email);
    userId = user.id;

    await page.getByRole("link", { name: "Créer un événement" }).click();
    const title = `E2E header logo ${Date.now()}`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 7, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    // Depuis l'événement : le logo remonte à "Mes événements", pas la landing.
    await page.getByText(title).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await logo.click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    // Depuis "Mes événements" lui-même : le logo redescend vers la landing.
    await logo.click();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    if (userId) await deleteTestUser(userId);
  }
});
