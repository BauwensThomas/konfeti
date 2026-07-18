"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { markArrivedHome } from "@/app/[locale]/actions/participants";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

// "Je suis bien rentré" (brief 4.11), extrait de `JourJActions.tsx` --
// indépendant du Mode Jour J/Terminé (retour Thomas : reste utile même une
// fois la fête officiellement close). Retour visuel immédiat au clic (même
// remède que `PollsListClient.tsx`/`JourJActions.tsx`).
export function GoHomeActions({
  rsvpId,
  shortCode,
  initialArrivedHome,
}: {
  rsvpId: string;
  shortCode: string;
  initialArrivedHome: boolean;
}) {
  const t = useTranslations("JourJ");
  const [isPending, startTransition] = useTransition();
  const [optimisticArrivedHome, setOptimisticArrivedHome] = useOptimistic(initialArrivedHome);

  // Re-cliquable dans les deux sens (retour Thomas : "on doit pouvoir
  // cliquer dessus et recliquer si on a fait une erreur").
  function handleArrivedHome() {
    const next = !optimisticArrivedHome;
    startTransition(async () => {
      setOptimisticArrivedHome(next);
      const result = await markArrivedHome(rsvpId, shortCode, next);
      if (!result.ok && result.error === "not_authenticated") {
        notifySessionExpired();
      }
    });
  }

  return (
    <Button
      variant={optimisticArrivedHome ? "successFilled" : "highlight"}
      disabled={isPending}
      onClick={handleArrivedHome}
      className="w-full"
    >
      {optimisticArrivedHome ? t("arrivedHome") : t("arrivedHomeButton")}
    </Button>
  );
}
