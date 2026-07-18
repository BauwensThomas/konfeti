"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { finalizeDatePoll, voteDateOption } from "@/app/[locale]/actions/date-poll";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { notifySessionExpired } from "@/lib/session-expired";

type DateOptionWithVotes = {
  id: string;
  startsAt: string;
  label: string | null;
  voteCount: number;
  votedByMe: boolean;
};

export function DatePollVoting({
  eventId,
  shortCode,
  isAdmin,
  options,
}: {
  eventId: string;
  shortCode: string;
  isAdmin: boolean;
  options: DateOptionWithVotes[];
}) {
  const t = useTranslations("EventPage");
  const [isPending, startTransition] = useTransition();
  const [confirmingOptionId, setConfirmingOptionId] = useState<string | null>(null);

  // Retour visuel immédiat au clic (avant que le Server Action + la
  // revalidation ne confirment la vraie valeur), sinon la case à cocher
  // "rebondit" à son ancien état le temps de l'aller-retour serveur.
  const [optimisticOptions, setOptimisticVote] = useOptimistic(
    options,
    (state, { optionId, checked }: { optionId: string; checked: boolean }) =>
      state.map((option) =>
        option.id === optionId
          ? {
              ...option,
              votedByMe: checked,
              voteCount: option.voteCount + (checked ? 1 : -1),
            }
          : option,
      ),
  );

  function handleToggle(optionId: string, checked: boolean) {
    startTransition(async () => {
      setOptimisticVote({ optionId, checked });
      const result = await voteDateOption(eventId, optionId, checked, shortCode);
      if (!result.ok && result.error === "not_authenticated") {
        notifySessionExpired();
      }
    });
  }

  function handleFinalizeConfirmed() {
    if (!confirmingOptionId) return;
    const optionId = confirmingOptionId;
    startTransition(async () => {
      const result = await finalizeDatePoll(eventId, optionId, shortCode);
      if (!result.ok && result.error === "not_authenticated") {
        notifySessionExpired();
      }
      setConfirmingOptionId(null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold text-foreground">{t("dateTBD")}</p>
      <ul className="flex flex-col gap-2">
        {optimisticOptions.map((option) => (
          <li
            key={option.id}
            className="flex items-center justify-between gap-3 rounded-konfeti border border-border p-3"
          >
            <label className="flex flex-1 items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={option.votedByMe}
                disabled={isPending}
                onChange={(e) => handleToggle(option.id, e.target.checked)}
              />
              <span>
                {formatDateTime(option.startsAt)}
                {option.label ? ` (${option.label})` : ""}
              </span>
            </label>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {t("voteCount", { count: option.voteCount })}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmingOptionId(option.id)}
                className="text-xs font-semibold text-primary underline"
              >
                {t("validateDate")}
              </button>
            )}
          </li>
        ))}
      </ul>

      <Modal open={confirmingOptionId !== null} onClose={() => setConfirmingOptionId(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, on évite le ré-encodage par l'optimiseur next/image (qui réintroduisait un fond noir) */}
        <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
        <p className="text-center text-base text-foreground">{t("validateDateConfirm")}</p>
        <div className="flex justify-center gap-3">
          <Button onClick={handleFinalizeConfirmed} disabled={isPending}>
            {t("validateDateConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingOptionId(null)}>
            {t("validateDateConfirmNo")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
