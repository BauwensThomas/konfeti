"use client";

import { useTranslations } from "next-intl";
import { useTabNavigation } from "@/components/EventTabs";

// Retour Thomas : statut de connexion Stripe affiché juste sous la
// bannière de l'Accueil, réservé au porteur de la cagnotte (jamais montré
// aux autres, voir la garde `viewerIsPotOwner` côté page.tsx) -- clic vers
// l'onglet Participer, où vit le vrai bouton "Configurer les paiements"
// (même `TabNavigationContext` que `JourJActions.tsx`/`PollsQuotaWarning.tsx`).
// Pas le composant `Card` partagé ici (retour Thomas : "affiche toujours un
// cadre blanc") -- ses classes par défaut (`border-border bg-surface`)
// entrent en conflit avec le rouge plein demandé, et Tailwind ne garantit
// pas que la classe la plus à droite dans la chaîne l'emporte visuellement.
export function PotConnectionBanner({ connected }: { connected: boolean }) {
  const t = useTranslations("Pot");
  const tabNavigation = useTabNavigation();

  return (
    <div
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-konfeti p-6 shadow-konfeti ${
        connected
          ? "border border-accent-mint bg-accent-mint/5"
          : // "doit être un fond rouge comme supprimer le compte" -- même
            // rouge plein que le bouton `danger` (voir `Button.tsx`).
            "bg-accent-coral"
      }`}
      onClick={() => tabNavigation?.setActive("participer", "cagnotte")}
    >
      <p className={`text-sm font-semibold ${connected ? "text-accent-mint" : "text-white"}`}>
        {t(connected ? "connectionBannerConnected" : "connectionBannerNotConnected")}
      </p>
    </div>
  );
}
