"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

// Bouton Partager (brief 4.2) : feuille de partage native (WhatsApp, SMS,
// copie du lien...) si le navigateur la supporte, sinon copie directe du
// lien dans le presse-papier. Le QR code / la carte imprimable (brief 4.13)
// restent un chantier Phase 6.
export function ShareEventButton({ title, url }: { title: string; url: string }) {
  const t = useTranslations("EventPage");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Partage annulé par la personne : rien à faire.
      }
      return;
    }

    // La copie peut échouer pour des raisons hors de notre contrôle (page
    // sans focus, permission refusée, contexte non sécurisé...) : sans ce
    // try/catch, un échec silencieux ne donnait aucun retour à la personne.
    try {
      await navigator.clipboard.writeText(url);
      setError(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  }

  return (
    <Button variant="secondary" onClick={handleShare} className="h-11 text-sm">
      {copied ? t("shareCopied") : error ? t("shareError") : t("shareButton")}
    </Button>
  );
}
