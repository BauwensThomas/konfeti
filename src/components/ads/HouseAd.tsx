"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Pubs maison (retour Thomas : "possible de mettre mes pubs bonvoleur.com et
// mes poilus.com... tant que adsense n'est pas accepté, si il y a un bug
// google avec les pubs on voit les miennes") -- affichées par AdBanner.tsx
// uniquement quand Google AdSense ne remplit pas l'emplacement (pas encore
// approuvé, aucune pub disponible, ou script indisponible), jamais en
// remplacement d'une vraie pub Google qui fonctionne. Une seule tirée au
// hasard à chaque affichage, jamais les deux à la fois.
const ADS_BASE = "https://tibinblvqxqcygzmxouv.supabase.co/storage/v1/object/public/ads-assets";

const HOUSE_ADS = [
  {
    href: "https://www.mespoilus.com",
    image: `${ADS_BASE}/mespoilus-banner.png`,
    alt: "Mes Poilus",
    caption: null,
  },
  {
    href: "https://www.bonvoleur.com",
    image: `${ADS_BASE}/bonvoleur-banner.png`,
    alt: "BonVoleur",
    // Retour Thomas : "il faut écrire un texte... pour dire aux gens ce que
    // c'est" -- contrairement à Mes Poilus, l'image seule (avion + logo) ne
    // dit pas ce qu'est le service.
    caption: "BonVoleur : bons plans vols pas chers, alertes par email.",
  },
];

export function HouseAd() {
  const t = useTranslations("Ads");
  // Initialiseur paresseux de `useState` plutôt qu'un `useMemo` (ESLint
  // `react-hooks/purity` interdit `Math.random()` pendant le rendu, y
  // compris dans un `useMemo` -- l'initialiseur paresseux est le pattern
  // React officiellement prévu pour un calcul impur exécuté une seule fois
  // par montage).
  const [ad] = useState(() => HOUSE_ADS[Math.floor(Math.random() * HOUSE_ADS.length)]);

  return (
    <div className="w-full max-w-lg rounded-konfeti border border-border bg-surface p-3 shadow-konfeti lg:max-w-2xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/40">{t("label")}</p>
      <a href={ad.href} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element -- image statique simple, pas besoin du pipeline next/image ici */}
        <img src={ad.image} alt={ad.alt} className="w-full rounded-konfeti" />
        {ad.caption && <p className="mt-2 text-center text-sm font-semibold text-foreground/70">{ad.caption}</p>}
      </a>
    </div>
  );
}
