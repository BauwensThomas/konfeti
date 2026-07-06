"use client";

import { useTranslations } from "next-intl";

// Écran affiché après le dépôt d'une demande de participation (brief 1.3
// étape 3). La validation par un admin (étape 4) est un chantier Phase 4 :
// pour l'instant, on ne fait qu'attendre, sans bouton d'action possible ici.
export function GuestPendingScreen() {
  const t = useTranslations("GuestIdentity");

  return (
    <div className="flex w-full max-w-sm lg:max-w-md flex-col items-center gap-4 text-center">
      <h1 className="font-display text-xl font-bold text-foreground">{t("pendingTitle")}</h1>
      <p className="text-sm text-foreground/70">{t("pendingBody")}</p>
    </div>
  );
}
