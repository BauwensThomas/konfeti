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
}: {
  rsvpId: string;
  shortCode: string;
  currentAnswer: Answer;
  showLeaveButton: boolean;
}) {
  const t = useTranslations("GuestIdentity");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  function handleAnswer(answer: Answer) {
    if (answer === currentAnswer) return;
    setError(null);
    startTransition(async () => {
      const result = await updateMyAnswer(rsvpId, shortCode, answer);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
      }
    });
  }

  function handleLeave() {
    setError(null);
    startTransition(async () => {
      const result = await leaveEvent(rsvpId, shortCode);
      if (result.ok) {
        setConfirmingLeave(false);
        router.refresh();
      } else {
        setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
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
            disabled={isPending}
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
    </div>
  );
}
