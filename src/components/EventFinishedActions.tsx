"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { endEvent } from "@/app/[locale]/actions/events";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

// "Rouvrir" (admin) : annule un clic accidentel sur "Terminer", même
// principe re-cliquable que le reste du Mode Jour J (retour Thomas). Sans
// effet si l'événement est terminé automatiquement par la date (le
// surlendemain) plutôt que manuellement -- rouvrir remet juste `ended_at` à
// `null`, `isEventOver` retombe alors sur le calcul de date habituel.
export function EventFinishedActions({ eventId, shortCode }: { eventId: string; shortCode: string }) {
  const t = useTranslations("JourJ");
  const [isPending, startTransition] = useTransition();

  function handleReopen() {
    startTransition(async () => {
      const result = await endEvent(eventId, shortCode, false);
      if (!result.ok && result.error === "not_authenticated") {
        notifySessionExpired();
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" disabled={isPending} onClick={handleReopen}>
      {t("reopenEventButton")}
    </Button>
  );
}
