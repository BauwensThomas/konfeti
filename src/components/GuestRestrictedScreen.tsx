"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { requestPotAccess } from "@/app/[locale]/actions/participants";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MyParticipationCard } from "@/components/MyParticipationCard";
import { PotContribution } from "@/components/PotContribution";
import { useLiveRsvpRefresh } from "@/lib/supabase/use-live-rsvp-refresh";

type PotInfo = {
  pot_enabled: boolean;
  pot_mode: "goal" | "open";
  pot_goal_cents: number | null;
  pot_label: string | null;
  pot_owner: string | null;
  pot_closed_at: string | null;
} | null;

// Accès restreint "cagnotte seule" (brief 1.3, réponse "je peux pas") : ni
// lieu, ni date, ni heure, ni chat, ni listes. La cagnotte n'est plus montrée
// automatiquement (durci, retour Thomas) : on demande d'abord si le
// participant veut quand même y participer (affinage produit, retour Thomas
// suivant : éviter de créer une demande d'autorisation côté admin pour
// quelqu'un qui ne se soucie pas de la cagnotte). Trois états possibles :
// pas encore demandé (bouton), demandé mais pas encore autorisé (message
// d'attente), ou autorisé (infos cagnotte visibles).
export function GuestRestrictedScreen({
  rsvpId,
  eventId,
  shortCode,
  currentAnswer,
  potEnabled,
  wantsPotAccess,
  potAccessGranted,
  pot,
  potFeatureEnabled,
  potCollectedCents,
}: {
  rsvpId: string;
  eventId: string;
  shortCode: string;
  currentAnswer: "yes" | "maybe" | "no";
  potEnabled: boolean;
  wantsPotAccess: boolean;
  potAccessGranted: boolean;
  pot: PotInfo;
  // Retour Thomas : "aucun moyen de faire un paiement" -- gate déjà utilisée
  // partout ailleurs (`feature_flags`, clé 'pot'), calculée une fois dans
  // page.tsx. `potCollectedCents` : total déjà collecté, pour l'affichage
  // "X€ collectés sur Y€" du vrai formulaire (`PotContribution.tsx`).
  potFeatureEnabled: boolean;
  potCollectedCents: number;
}) {
  const t = useTranslations("GuestIdentity");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Autorisation/refus de la cagnotte par l'admin, ou changement d'avis
  // depuis un autre appareil : reflété automatiquement, sans F5 (retour Thomas).
  useLiveRsvpRefresh(rsvpId);

  function handleRequestPotAccess() {
    setError(null);
    startTransition(async () => {
      const result = await requestPotAccess(rsvpId, shortCode);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
      }
    });
  }

  return (
    <div className="flex w-full max-w-sm lg:max-w-md flex-col items-center gap-4 text-center">
      <h1 className="font-display text-xl font-bold text-foreground">{t("restrictedTitle")}</h1>
      <p className="text-sm text-foreground/70">{t("restrictedBody")}</p>

      {/* Retour Thomas : "aucun moyen de faire un paiement" -- l'accès
          "cagnotte seule" ne montrait que le libellé/l'objectif (construit
          bien avant le vrai paiement, Phase 7), jamais le formulaire réel.
          Vrai composant de contribution ici, identique à celui utilisé pour
          un participant approuvé (voir page.tsx). */}
      {potEnabled && pot?.pot_enabled && potAccessGranted && potFeatureEnabled && (
        <div className="w-full">
          <PotContribution
            eventId={eventId}
            label={pot.pot_label}
            mode={pot.pot_mode}
            goalCents={pot.pot_goal_cents}
            collectedCents={potCollectedCents}
            closedAt={pot.pot_closed_at}
          />
        </div>
      )}
      {potEnabled && pot?.pot_enabled && potAccessGranted && !potFeatureEnabled && (
        <Card className="w-full">
          <p className="text-base text-foreground">
            {t("restrictedPotLabel", { label: pot.pot_label || "" })}
          </p>
          <p className="text-sm text-foreground/70">
            {pot.pot_mode === "goal" && pot.pot_goal_cents
              ? t("restrictedPotGoal", { amount: (pot.pot_goal_cents / 100).toFixed(0) })
              : t("restrictedPotOpen")}
          </p>
        </Card>
      )}

      {potEnabled && !potAccessGranted && (
        <Card className="w-full">
          {wantsPotAccess ? (
            <p className="text-sm text-foreground/70">{t("restrictedPotPending")}</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-foreground">{t("restrictedPotAsk")}</p>
              {error && (
                <p role="alert" className="text-sm text-accent-coral">
                  {error}
                </p>
              )}
              <Button size="sm" disabled={isPending} onClick={handleRequestPotAccess}>
                {t("restrictedPotAskButton")}
              </Button>
            </div>
          )}
        </Card>
      )}

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
