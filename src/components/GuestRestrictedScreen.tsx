"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { MyParticipationCard } from "@/components/MyParticipationCard";

type PotInfo = {
  pot_enabled: boolean;
  pot_mode: "goal" | "open";
  pot_goal_cents: number | null;
  pot_label: string | null;
} | null;

// Accès restreint "cagnotte seule" (brief 1.3, réponse "je peux pas") : ni
// lieu, ni date, ni heure, ni chat, ni listes. Si une cagnotte existe, ses
// seules infos (label/objectif) sont visibles ; sinon, seul le message et le
// contrôle de réponse (pour changer d'avis) s'affichent.
export function GuestRestrictedScreen({
  rsvpId,
  shortCode,
  currentAnswer,
  pot,
}: {
  rsvpId: string;
  shortCode: string;
  currentAnswer: "yes" | "maybe" | "no";
  pot: PotInfo;
}) {
  const t = useTranslations("GuestIdentity");

  return (
    <div className="flex w-full max-w-sm lg:max-w-md flex-col items-center gap-4 text-center">
      <h1 className="font-display text-xl font-bold text-foreground">{t("restrictedTitle")}</h1>
      <p className="text-sm text-foreground/70">{t("restrictedBody")}</p>

      {pot?.pot_enabled && (
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
