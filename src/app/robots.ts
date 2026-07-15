import type { MetadataRoute } from "next";

// SEO (Phase 6, TODO). Interdit tout ce qui est réservé à un compte ou
// spécifique à un événement -- les pages événement ont déjà leur propre
// `robots: { index: false, follow: false }` (`generateMetadata`, voir
// `e/[shortCode]/page.tsx`), cette règle le confirme au niveau du site.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://konfeti.belgacai.com";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/fr/e/", "/fr/connexion", "/fr/creer", "/fr/mes-evenements", "/fr/profil"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
