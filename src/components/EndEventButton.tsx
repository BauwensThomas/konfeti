"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { endEvent } from "@/app/[locale]/actions/events";
import { Button } from "@/components/ui/Button";

// "Terminer" (brief 4.11, proposé par Thomas) : tout en bas de la page
// Accueil, même largeur que les autres boutons Jour J (retour Thomas), en
// rouge -- une action qui bascule toute la page mérite d'être visuellement à
// part du reste. Admin uniquement, re-cliquable (même principe que
// "Je suis arrivé"/"Je suis bien rentré") pour annuler un clic accidentel.
export function EndEventButton({ eventId, shortCode }: { eventId: string; shortCode: string }) {
  const t = useTranslations("JourJ");
  const [isPending, startTransition] = useTransition();

  function handleEndEvent() {
    startTransition(async () => {
      await endEvent(eventId, shortCode, true);
    });
  }

  return (
    <Button variant="danger" disabled={isPending} onClick={handleEndEvent} className="w-full">
      {t("endEventButton")}
    </Button>
  );
}
