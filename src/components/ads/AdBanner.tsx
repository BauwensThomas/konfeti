"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
  // Le temps que Google décide du format réel, la zone réservée ne doit
  // jamais devenir un grand carré vide (retour Thomas) -- hauteur plafonnée
  // pendant le chargement seulement, relâchée dès que Google a rempli
  // l'emplacement (sinon une vraie pub plus haute que 128px serait coupée).
  const [loading, setLoading] = useState(true);
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const slotId = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

  useEffect(() => {
    if (!clientId || !slotId) return;
    if (pushed.current) return;
    pushed.current = true;

    // Script injecté manuellement (pas `next/script`) : Next.js y ajoute un
    // attribut `data-nscript` que le script Google ne reconnaît pas
    // ("AdSense head tag doesn't support data-nscript attribute", warning
    // console inoffensif mais évitable). Vérifie d'abord qu'il n'est pas
    // déjà présent : plusieurs `AdBanner` peuvent être montés sur la même
    // page (tous les 3 événements sur "Mes événements"), un seul chargement
    // du script suffit pour tous.
    if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }

    try {
      // @ts-expect-error -- adsbygoogle est injecté globalement par le script Google, pas typé
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Best-effort : une pub qui ne charge pas ne doit jamais casser la page.
    }

    const el = insRef.current;
    if (!el) return;

    const checkStatus = () => {
      const status = el.getAttribute("data-ad-status");
      if (status === "unfilled") setShowHouseAd(true);
      if (status) setLoading(false);
    };
    const observer = new MutationObserver(checkStatus);
    observer.observe(el, { attributes: true, attributeFilter: ["data-ad-status"] });
    const fallbackTimer = setTimeout(() => {
      if (el.getAttribute("data-ad-status") !== "filled") setShowHouseAd(true);
      setLoading(false);
    }, 4000);

    return () => {
      observer.disconnect();
      clearTimeout(fallbackTimer);
    };
  }, [clientId, slotId]);

  if (!clientId || !slotId || showHouseAd) return <HouseAd />;

  return (
    <div className="w-full max-w-lg rounded-konfeti border border-border bg-surface p-3 shadow-konfeti lg:max-w-2xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/60">{t("label")}</p>
      <ins
        ref={insRef}
        className={`adsbygoogle block ${loading ? "max-h-32 overflow-hidden" : ""}`}
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </div>
  );
}
