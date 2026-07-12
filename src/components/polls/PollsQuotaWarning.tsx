"use client";

import { useTranslations } from "next-intl";
import { useTabNavigation } from "@/components/EventTabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// Retour Thomas : "peut être aussi mettre sur l'accueil, attention tu as un
// vote en trop suite au retrait d'une personne, modifie dans Participer" --
// prévient sur l'Accueil quand un sondage "choix unique" (voir
// `PollsAccueilSummary.tsx`, qui calcule le dépassement/le manque) est en
// dépassement OU a du budget non réparti pour le viewer, avec un raccourci
// direct vers l'onglet Participer (même `TabNavigationContext` que
// `JourJActions.tsx`) où le vote se corrige réellement (compteur -/+, voir
// `PollsListClient.tsx`).
export function PollsQuotaWarning({ variant }: { variant: "over" | "under" }) {
  const t = useTranslations("Polls");
  const tabNavigation = useTabNavigation();

  return (
    <Card className="flex items-center justify-between gap-3 border-accent-coral bg-accent-coral/5">
      <p className="text-sm font-semibold text-accent-coral">
        {t(variant === "over" ? "quotaWarningAccueil" : "quotaWarningAccueilUnder")}
      </p>
      <Button size="sm" variant="danger" onClick={() => tabNavigation?.setActive("participer")}>
        {t("quotaWarningGoTo")}
      </Button>
    </Card>
  );
}
