"use client";

import { useTranslations } from "next-intl";
import { MyParticipationCard } from "@/components/MyParticipationCard";
import { useLiveRsvpRefresh } from "@/lib/supabase/use-live-rsvp-refresh";

// Écran affiché après le dépôt d'une demande de participation (brief 1.3
// étape 3), en attente de validation par un admin. Le participant peut déjà
// changer sa réponse librement (brief 1.3) via MyParticipationCard ; "je
// peux pas" le fera basculer directement en accès restreint au prochain
// chargement de la page.
export function GuestPendingScreen({
  rsvpId,
  shortCode,
  currentAnswer,
}: {
  rsvpId: string;
  shortCode: string;
  currentAnswer: "yes" | "maybe" | "no";
}) {
  const t = useTranslations("GuestIdentity");
  // Dès que l'admin valide (ou refuse), cette page doit se recharger d'elle-
  // même vers l'événement complet (ou le nouvel état restreint) sans F5
  // (retour Thomas).
  useLiveRsvpRefresh(rsvpId);

  return (
    <div className="flex w-full max-w-sm lg:max-w-md flex-col items-center gap-4 text-center">
      <h1 className="font-display text-xl font-bold text-foreground">{t("pendingTitle")}</h1>
      <p className="text-sm text-foreground/70">{t("pendingBody")}</p>
      <div className="w-full">
        <MyParticipationCard
          rsvpId={rsvpId}
          shortCode={shortCode}
          currentAnswer={currentAnswer}
          showLeaveButton={false}
        />
      </div>
    </div>
  );
}
