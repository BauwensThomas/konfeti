import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test("un evenement a des metadonnees Open Graph dynamiques et un bouton Partager fonctionnel", async ({
  page,
  context,
}) => {
  const email = `e2e-share-og-${Date.now()}@example.com`;
  const user = await loginAs(page, email);

  // navigator.share() ouvre la vraie feuille de partage native de l'OS en
  // mode "headed" (navigateur visible, ex. le plugin Test de l'IDE) — une
  // fenetre systeme que le test ne peut ni voir ni fermer, ce qui bloque le
  // test indefiniment. En CLI headless, navigator.share n'existe pas du
  // tout, donc ce risque passe inapercu. On neutralise l'API explicitement
  // pour un comportement deterministe (repli "copier le lien") quel que
  // soit le mode d'execution.
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "share", { value: undefined, configurable: true });
  });

  try {
    await page.goto("/profil/completer");
    await page.getByLabel("Ton numéro de téléphone").fill("+32470000095");
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    await page.getByRole("link", { name: "Créer un événement" }).click();
    const title = `Fete Partage OG ${Date.now()}`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 4, 1000 Bruxelles");
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

    // Metadonnees Open Graph dynamiques : titre reel, pas indexe, image OG.
    const response = await page.request.get(`/e/${event.short_code}`);
    const html = await response.text();
    expect(html).toContain(`<title>${title} · Konfeti</title>`);
    expect(html).toContain(`<meta property="og:title" content="${title}"/>`);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(html).toContain(`/api/og/${event.short_code}`);

    // L'image Open Graph se genere correctement (PNG, pas d'erreur serveur).
    const ogImage = await page.request.get(`/api/og/${event.short_code}`);
    expect(ogImage.status()).toBe(200);
    expect(ogImage.headers()["content-type"]).toBe("image/png");
    expect((await ogImage.body()).length).toBeGreaterThan(1000);

    // Bouton Partager : navigator.share neutralisee plus haut, le clic
    // emprunte donc le repli "copier le lien".
    await page.goto(`/e/${event.short_code}`);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Partager" }).click();
    await expect(page.getByText("Lien copié !")).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(`${process.env.NEXT_PUBLIC_APP_URL}/e/${event.short_code}`);

    await supabaseAdmin.from("events").delete().eq("id", event.id);
  } finally {
    await deleteTestUser(user.id);
  }
});
