"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

// Retour Thomas : "j'aimerais rajouter des pub admob" -- AdMob est pensé
// pour une vraie app native, alors que l'Android de Konfeti n'est qu'un
// TWA (emballage du site) sans vraie interface native pour y insérer des
// vues publicitaires. Google AdSense (pubs web classiques) convient bien
// mieux ici : intégré directement dans le site, il apparaît identique sur
// le web, la PWA et le TWA Android, sans aucun code natif à toucher.
// N'affiche RIEN tant que le flag "ads" (feature_flags) est désactivé --
// le composant n'est même pas monté par la page appelante dans ce cas
// (voir mes-evenements/page.tsx), donc le script Google n'est jamais
// chargé non plus (pas de cookie/traqueur publicitaire posé pour rien).
export function AdBanner() {
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      // @ts-expect-error -- adsbygoogle est injecté globalement par le script Google, pas typé
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Best-effort : une pub qui ne charge pas ne doit jamais casser la page.
    }
  }, []);

  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;
  if (!clientId || !slotId) {
    // TEMPORAIRE (retour Thomas : "j'aimerais voir en localhost où se
    // trouvent les cadres") -- à retirer une fois la position confirmée,
    // pour revenir à `return null` en prod tant qu'aucun identifiant
    // AdSense réel n'est configuré.
    return (
      <div className="flex h-24 w-full items-center justify-center rounded-konfeti border-2 border-dashed border-primary/40 bg-primary/5 text-sm text-primary/60">
        Emplacement publicité (AdSense)
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg lg:max-w-2xl">
      <Script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
        crossOrigin="anonymous"
        strategy="lazyOnload"
      />
      <ins
        ref={insRef}
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
