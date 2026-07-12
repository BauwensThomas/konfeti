"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { checkIn } from "@/app/[locale]/actions/participants";
import { useTabNavigation } from "@/components/EventTabs";
import { Button } from "@/components/ui/Button";

// Mode Jour J (brief 4.11) : "Je suis arrivé" + raccourcis vers Chat/
// Participer. "Je suis bien rentré" vit dans `GoHomeActions.tsx`, "Terminer"
// tout en bas de la page Accueil (`EndEventButton.tsx`, retour Thomas) --
// tous deux des composants séparés, affichés indépendamment de cette carte.
// Retour visuel immédiat au clic (même remède que le vote des sondages,
// `PollsListClient.tsx` : sans mise à jour optimiste, un bouton contrôlé par
// une prop serveur "rebondit" à son ancien état le temps de l'aller-retour
// serveur).
export function JourJActions({
  rsvpId,
  shortCode,
  isAdmin,
  initialCheckedIn,
}: {
  rsvpId: string;
  shortCode: string;
  isAdmin: boolean;
  initialCheckedIn: boolean;
}) {
  const t = useTranslations("JourJ");
  const [isPending, startTransition] = useTransition();
  const [optimisticCheckedIn, setOptimisticCheckedIn] = useOptimistic(initialCheckedIn);
  const tabNavigation = useTabNavigation();

  // Re-cliquable dans les deux sens (retour Thomas : "on doit pouvoir
  // cliquer dessus et recliquer si on a fait une erreur") -- jamais
  // `disabled` une fois coché, le clic bascule l'état au lieu de le figer.
  function handleCheckIn() {
    const next = !optimisticCheckedIn;
    startTransition(async () => {
      setOptimisticCheckedIn(next);
      await checkIn(rsvpId, shortCode, next);
    });
  }

  // Largeurs alignées (retour Thomas : "je suis arrivé doit avoir la même
  // largeur que la totalité des deux du dessous") : les rangées occupent
  // toute la largeur de la carte, "Aller au chat"/"Voir qui a apporté quoi"
  // se partagent la leur à égalité (`flex-1`) plutôt que de rester à leur
  // largeur de contenu.
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Button
        variant={optimisticCheckedIn ? "successFilled" : "primary"}
        disabled={isPending}
        onClick={handleCheckIn}
        className="w-full"
      >
        {optimisticCheckedIn ? t("checkedIn") : t("checkInButton")}
      </Button>
      {/* Même taille que "Je suis arrivé" (retour Thomas : "même chose pour
          chat et apporter quoi, tous la même taille") -- plus de
          `size="sm"`. */}
      <div className="flex w-full gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => tabNavigation?.setActive("chat")}>
          {t("goToChat")}
        </Button>
        {isAdmin && (
          <Button variant="secondary" className="flex-1" onClick={() => tabNavigation?.setActive("participer")}>
            {t("goToBringChecklist")}
          </Button>
        )}
      </div>
    </div>
  );
}
