import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

// Résout l'avertissement Google Search Console repéré par Thomas ("Page en
// double sans URL canonique sélectionnée par l'utilisateur" sur
// /fr/mentions-legales) : next-intl (`localePrefix` par défaut = "always")
// redirige silencieusement `/mentions-legales` (sans langue) vers
// `/fr/mentions-legales` via un 307 TEMPORAIRE -- jamais un 301/308
// permanent, next-intl ne l'expose pas autrement -- donc Google peut traiter
// les deux URLs comme potentiellement distinctes sans signal explicite.
// `alternates.canonical` + `alternates.languages` (hreflang) lèvent
// l'ambiguïté indépendamment du code de statut de la redirection.
export function localizedPageMetadata({
  locale,
  pathname,
  title,
}: {
  locale: string;
  pathname: string;
  title: string;
}): Metadata {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    title,
    alternates: {
      canonical: `${base}/${locale}${pathname}`,
      languages: Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${pathname}`])),
    },
  };
}
