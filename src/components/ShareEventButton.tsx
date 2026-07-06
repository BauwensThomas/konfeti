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

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Partage annulé par la personne : rien à faire.
      }
      return;
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="secondary" onClick={handleShare} className="text-sm">
      {copied ? t("shareCopied") : t("shareButton")}
    </Button>
  );
}
