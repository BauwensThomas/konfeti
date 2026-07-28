import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

// SEO (Phase 6, TODO). Resté figé sur `/fr` uniquement depuis la Phase 6
// (à l'époque, une seule locale) -- jamais mis à jour lors du passage aux 6
// langues (2026-07-18), repéré en creusant un avertissement Google Search
// Console signalé par Thomas ("Page en double sans URL canonique
// sélectionnée par l'utilisateur"). Désormais une entrée par langue pour
// chaque page statique, avec les mêmes alternates hreflang que
// `src/lib/seo.ts` (cohérence entre le sitemap et les balises `<link
// rel="alternate">` de chaque page). Seules les pages publiques statiques
// sont listées -- jamais les routes réservées à un compte (connexion,
// creer, mes-evenements, profil) ni les pages événement (`/[locale]/e/[shortCode]`,
// déjà `robots: { index: false, follow: false }` dans leur propre
// `generateMetadata`, confirmé ici par `robots.ts`).
const STATIC_PATHS = ["", "/cgu", "/confidentialite", "/cookies", "/mentions-legales"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://konfeti.belgacai.com";

  return STATIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`])),
      },
    })),
  );
}
