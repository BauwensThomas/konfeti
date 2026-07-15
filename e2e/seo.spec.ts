import { test, expect } from "@playwright/test";

// SEO (Phase 6, TODO) : sitemap.xml et robots.txt, routes publiques
// uniquement -- aucune session nécessaire pour ces deux fichiers générés.
test("sitemap.xml liste les pages publiques, jamais les evenements ni les routes reservees a un compte", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();

  expect(body).toContain("<urlset");
  expect(body).toContain("/fr</loc>");
  expect(body).toContain("/fr/cgu</loc>");
  expect(body).toContain("/fr/confidentialite</loc>");
  expect(body).toContain("/fr/cookies</loc>");
  expect(body).toContain("/fr/mentions-legales</loc>");
  expect(body).not.toContain("/fr/e/");
  expect(body).not.toContain("/fr/creer");
  expect(body).not.toContain("/fr/mes-evenements");
  expect(body).not.toContain("/fr/profil");
});

test("robots.txt interdit les evenements et les routes reservees a un compte, reference le sitemap", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();

  expect(body).toContain("Disallow: /fr/e/");
  expect(body).toContain("Disallow: /fr/connexion");
  expect(body).toContain("Disallow: /fr/creer");
  expect(body).toContain("Disallow: /fr/mes-evenements");
  expect(body).toContain("Disallow: /fr/profil");
  expect(body).toContain("Sitemap:");
  expect(body).toContain("/sitemap.xml");
});
