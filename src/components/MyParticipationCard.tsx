"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateMyAnswer, leaveEvent } from "@/app/[locale]/actions/participants";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Answer = "yes" | "maybe" | "no";

// Contrôle générique "changer ma réponse" (brief 1.3 : n'importe quel
// participant peut passer de "je viens" à "peut-être" ou "je peux pas" à
// tout moment, peu importe son statut actuel) + "quitter" (brief 1.5).
// Réutilisé sur l'écran d'attente, l'écran restreint, et l'onglet Accueil
// d'un participant approuvé (jamais affiché à l'hôte, voir page.tsx).
export function MyParticipationCard({
  rsvpId,
  shortCode,
  currentAnswer,
  showLeaveButton,
  isEventOver = false,
}: {
  rsvpId: string;
  shortCode: string;
  currentAnswer: Answer;
  showLeaveButton: boolean;
  // Retour Thomas : "quand c'est fini on ne doit plus pouvoir choisir je
  // viens, peut-être ou je viens pas" -- répondre à un événement déjà passé
  // n'a plus de sens.
  isEventOver?: boolean;
}) {
  const t = useTranslations("GuestIdentity");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // "Je ne peux pas" retire désormais accompagnants/qui-apporte-quoi/sondages
  // et anonymise l'identité (retour Thomas, voir `update_my_answer`) --
  // action destructive comme "Quitter", donc confirmée de la même façon
  // plutôt qu'appliquée au premier clic.
  const [confirmingNo, setConfirmingNo] = useState(false);

  function submitAnswer(answer: Answer) {
    setError(null);
    startTransition(async () => {
      const result = await updateMyAnswer(rsvpId, shortCode, answer);
      if (result.ok) {
        setConfirmingNo(false);
        router.refresh();
      } else {
        setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
      }
    });
  }

  function handleAnswer(answer: Answer) {
    if (answer === currentAnswer) return;
    if (answer === "no") {
      setConfirmingNo(true);
      return;
    }
    submitAnswer(answer);
  }

  function handleLeave() {
    setError(null);
    startTransition(async () => {
      const result = await leaveEvent(rsvpId, shortCode);
      if (result.ok) {
        setConfirmingLeave(false);
        router.refresh();
      } else {
        // "organizer_protected" : filet de sécurité, ce bouton n'est de
        // toute façon jamais affiché à l'organisateur (voir page.tsx).
        setError(
          result.error === "rate_limited"
            ? t("errorRateLimited")
            : result.error === "organizer_protected"
              ? t("errorOrganizerProtected")
              : t("errorUnknown"),
        );
      }
    });
  }

  const answers: { value: Answer; label: string }[] = [
    { value: "yes", label: t("answerYes") },
    { value: "maybe", label: t("answerMaybe") },
    { value: "no", label: t("answerNo") },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {answers.map((a) => (
          <button
            key={a.value}
            type="button"
            disabled={isPending || isEventOver}
            onClick={() => handleAnswer(a.value)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
              a.value === currentAnswer
                ? "bg-primary text-white"
                : "bg-surface text-foreground/70 hover:bg-primary/10"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-center text-sm text-accent-coral">
          {error}
        </p>
      )}
      {showLeaveButton && (
        <>
          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            className="text-center text-sm font-semibold text-accent-coral"
          >
            {t("leaveButton")}
          </button>
          <Modal open={confirmingLeave} onClose={() => setConfirmingLeave(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, voir CancelEventButton */}
            <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
            <p className="text-center text-base text-foreground">{t("leaveConfirmTitle")}</p>
            <div className="flex justify-center gap-3">
              <Button disabled={isPending} onClick={handleLeave}>
                {t("leaveConfirmYes")}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingLeave(false)}>
                {t("leaveConfirmNo")}
              </Button>
            </div>
          </Modal>
        </>
      )}
      <Modal open={confirmingNo} onClose={() => setConfirmingNo(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, voir CancelEventButton */}
        <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
        <p className="text-center text-base text-foreground">{t("noConfirmTitle")}</p>
        <div className="flex justify-center gap-3">
          <Button variant="danger" disabled={isPending} onClick={() => submitAnswer("no")}>
            {t("noConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingNo(false)}>
            {t("leaveConfirmNo")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
