"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Script from "next/script";
import { HouseAd } from "./HouseAd";

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
  const t = useTranslations("Ads");
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  // Retour Thomas : "possible de mettre mes pubs bonvoleur.com et mes
  // poilus.com... tant que adsense n'est pas accepté, une fois accepté ça
  // passe d'office avant, si il y a un bug google on voit les miennes" --
  // Google pose l'attribut `data-ad-status` sur le <ins> une fois la
  // tentative de remplissage terminée : "filled" (vraie pub Google) ou
  // "unfilled" (aucune pub disponible). Un `MutationObserver` regarde ce
  // changement ; un minuteur de secours couvre aussi le cas où le script
  // Google ne charge pas du tout (attribut jamais posé).
  const [showHouseAd, setShowHouseAd] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

  useEffect(() => {
    if (!clientId || !slotId) return;
    if (pushed.current) return;
    pushed.current = true;
    try {
      // @ts-expect-error -- adsbygoogle est injecté globalement par le script Google, pas typé
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Best-effort : une pub qui ne charge pas ne doit jamais casser la page.
    }

    const el = insRef.current;
    if (!el) return;

    const checkStatus = () => {
      if (el.getAttribute("data-ad-status") === "unfilled") setShowHouseAd(true);
    };
    const observer = new MutationObserver(checkStatus);
    observer.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });
    const fallbackTimer = setTimeout(() => {
      if (el.getAttribute("data-ad-status") !== "filled") setShowHouseAd(true);
    }, 4000);

    return () => {
      observer.disconnect();
      clearTimeout(fallbackTimer);
    };
  }, [clientId, slotId]);

  if (!clientId || !slotId || showHouseAd) return <HouseAd />;

  return (
    <div className="w-full max-w-lg rounded-konfeti border border-border bg-surface p-3 shadow-konfeti lg:max-w-2xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/40">{t("label")}</p>
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
