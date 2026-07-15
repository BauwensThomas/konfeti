import type { MetadataRoute } from "next";

// SEO (Phase 6, TODO). Une seule locale (`fr`, `localePrefix: "always"`,
// voir `src/i18n/routing.ts`) : pas besoin d'un fichier localisé par langue,
// les URLs vivent toutes sous `/fr`. Seules les pages publiques statiques
// sont listées -- jamais les routes réservées à un compte (connexion,
// creer, mes-evenements, profil) ni les pages événement (`/fr/e/[shortCode]`,
// déjà `robots: { index: false, follow: false }` dans leur propre
// `generateMetadata`, confirmé ici par `robots.ts`).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://konfeti.belgacai.com";
  const paths = ["/fr", "/fr/cgu", "/fr/confidentialite", "/fr/cookies", "/fr/mentions-legales"];

  return paths.map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));
}
