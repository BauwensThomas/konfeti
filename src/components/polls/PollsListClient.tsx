"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { approvePoll, proposePoll, rejectPoll, votePollOption } from "@/app/[locale]/actions/polls";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";

export type PollOptionView = {
  id: string;
  label: string;
  voteCount: number;
  votedByMe: boolean;
};

export type PollView = {
  id: string;
  question: string;
  // Proposition de sondage par un invité, modérée par l'admin -- `status`
  // vaut toujours 'approved' pour un sondage défini au wizard (comportement
  // historique). `proposedByName` est `null` pour un sondage créé par
  // l'organisateur (jamais proposé par quelqu'un), même principe que
  // `BringItemView`.
  status: "pending" | "approved";
  proposedByName: string | null;
  options: PollOptionView[];
};

// Panneau "sondages" (brief : "Sondage(s) optionnel(s)"). Même architecture
// que `BringListClient.tsx` : Realtime (souscription toujours montée dans
// EventTabs.tsx, pas ici) ne sert qu'à savoir QU'IL FAUT rafraîchir via
// `router.refresh()`, qui recharge `PollsList` (Server Component) avec des
// données fraîches.
export function PollsListClient({
  eventId,
  shortCode,
  viewerRsvpId,
  isAdmin,
  initialPolls,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  initialPolls: PollView[];
}) {
  const t = useTranslations("Polls");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Proposition de sondage par un invité, état du petit formulaire dédié --
  // au moins 2 options dès le départ (retour Thomas : une seule option de
  // libellé identique à la question rendait le formulaire peu clair --
  // "il faut un titre et 2 propositions"), même principe que l'éditeur du
  // wizard (CreateEventWizard.tsx, étape 4).
  const [proposeQuestion, setProposeQuestion] = useState("");
  const [proposeOptions, setProposeOptions] = useState(["", ""]);
  const [proposeSuccess, setProposeSuccess] = useState(false);

  // Formulaire de proposition dans un popup plutôt que toujours déplié
  // (retour Thomas : "ça va être beaucoup sur téléphone" une fois les deux
  // sections -- sondages ET qui apporte quoi -- empilées sur Participer),
  // même `Modal` réutilisable que partout ailleurs dans le projet
  // (UnitPickerButton, fusion/suppression d'item...).
  const [isProposeOpen, setIsProposeOpen] = useState(false);
  const [confirmingDeletePollId, setConfirmingDeletePollId] = useState<string | null>(null);

  // Message de confirmation transitoire, pas un statut permanent (même
  // remède que "qui apporte quoi", retour Thomas : il restait affiché
  // indéfiniment) -- referme aussi le popup une fois le message écoulé.
  useEffect(() => {
    if (!proposeSuccess) return;
    const timeout = setTimeout(() => {
      setProposeSuccess(false);
      setIsProposeOpen(false);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [proposeSuccess]);

  // Retour visuel immédiat au clic (avant que le Server Action + la
  // revalidation ne confirment la vraie valeur), sinon la case à cocher
  // "rebondit" à son ancien état le temps de l'aller-retour serveur --
  // bug réel trouvé en testant (la case se décochait aussitôt cliquée),
  // même correctif que `DatePollVoting.tsx` pour le sondage de date.
  const [optimisticPolls, setOptimisticVote] = useOptimistic(
    initialPolls,
    (state, { optionId, checked }: { optionId: string; checked: boolean }) =>
      state.map((poll) => ({
        ...poll,
        options: poll.options.map((option) =>
          option.id === optionId
            ? { ...option, votedByMe: checked, voteCount: option.voteCount + (checked ? 1 : -1) }
            : option,
        ),
      })),
  );

  const approvedPolls = optimisticPolls.filter((poll) => poll.status === "approved");
  const pendingPolls = optimisticPolls.filter((poll) => poll.status === "pending");

  function handleVote(optionId: string, checked: boolean) {
    if (!viewerRsvpId) return;
    setError(null);
    startTransition(async () => {
      setOptimisticVote({ optionId, checked });
      const result = await votePollOption(eventId, viewerRsvpId, shortCode, { optionId, checked });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handlePropose() {
    if (!viewerRsvpId) return;
    const question = proposeQuestion.trim();
    const options = proposeOptions.map((o) => o.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    setError(null);
    setProposeSuccess(false);
    startTransition(async () => {
      const result = await proposePoll(eventId, shortCode, viewerRsvpId, {
        question,
        options: options.map((label) => ({ label })),
      });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      setProposeQuestion("");
      setProposeOptions(["", ""]);
      setProposeSuccess(true);
      router.refresh();
    });
  }

  function handleApprove(pollId: string) {
    setError(null);
    startTransition(async () => {
      const result = await approvePoll(shortCode, pollId);
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handleReject(pollId: string) {
    setError(null);
    startTransition(async () => {
      const result = await rejectPoll(shortCode, pollId);
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  // Suppression d'un sondage déjà approuvé par un admin (retour Thomas :
  // "les admins ou organisateur doivent avoir la possibilité de supprimer le
  // sondage") -- même action serveur que le refus d'une proposition en
  // attente (`rejectPoll`, `polls_delete_admin` ne distingue pas le statut),
  // simplement déclenchée depuis un contexte différent avec sa propre
  // confirmation (même pattern que `deleteBringItem`/`confirmingDeleteItemId`
  // dans BringListClient.tsx).
  function handleDeletePoll(pollId: string) {
    setConfirmingDeletePollId(null);
    setError(null);
    startTransition(async () => {
      const result = await rejectPoll(shortCode, pollId);
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      {/* Gros titre de section (retour Thomas, même correctif que
          BringListClient.tsx : les deux sections sont empilées sur l'onglet
          Participer, chacune a besoin de son propre titre pour rester
          distincte). */}
      <p className="font-display text-lg font-bold text-foreground">{t("heading")}</p>

      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}

      {/* Modération admin : n'apparaît que pour un admin (RLS ne renvoie de
          toute façon les sondages 'pending' qu'à un admin -- `pendingPolls`
          reste structurellement vide pour tout autre viewer, ce garde-fou
          `isAdmin` est une défense en profondeur, pas la seule protection). */}
      {isAdmin && pendingPolls.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-display text-lg font-bold text-foreground">{t("pendingSectionTitle")}</p>
          {pendingPolls.map((poll) => (
            <div key={poll.id} className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
              <p className="text-sm font-semibold text-foreground">{poll.question}</p>
              <ul className="flex flex-col gap-0.5 text-xs text-foreground/70">
                {poll.options.map((option) => (
                  <li key={option.id}>{option.label}</li>
                ))}
              </ul>
              {poll.proposedByName && (
                <p className="text-xs text-foreground/60">{t("proposedBy", { name: poll.proposedByName })}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={isPending} onClick={() => handleApprove(poll.id)}>
                  {t("approve")}
                </Button>
                <Button size="sm" variant="danger" disabled={isPending} onClick={() => handleReject(poll.id)}>
                  {t("reject")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {approvedPolls.length === 0 ? (
        <p className="text-center text-sm text-foreground/60">{t("empty")}</p>
      ) : (
        approvedPolls.map((poll) => (
          <div key={poll.id} className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
            <p className="font-display text-lg font-bold text-foreground">{poll.question}</p>
            <ul className="flex flex-col gap-2">
              {poll.options.map((option) => (
                <li key={option.id} className="flex items-center justify-between gap-3">
                  <label className="flex flex-1 items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={option.votedByMe}
                      disabled={isPending || !viewerRsvpId}
                      onChange={(e) => handleVote(option.id, e.target.checked)}
                    />
                    <span>{option.label}</span>
                  </label>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {t("voteCount", { count: option.voteCount })}
                  </span>
                </li>
              ))}
            </ul>
            {/* Retour Thomas : "les admins ou organisateur doivent avoir la
                possibilité de supprimer le sondage" -- pas seulement refuser
                une proposition encore en attente. */}
            {isAdmin && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingDeletePollId(poll.id)}
                className="self-start text-xs font-semibold text-accent-coral"
              >
                {t("deletePoll")}
              </button>
            )}
          </div>
        ))
      )}

      {/* Proposition de sondage par un invité, dans un popup plutôt que
          toujours déplié (retour Thomas : trop de place prise sur mobile une
          fois empilé avec "qui apporte quoi") -- visible à tout participant
          approuvé non masqué (même condition que le vote : `viewerRsvpId`
          n'existe que dans ce cas). */}
      {viewerRsvpId && (
        <Button variant="secondary" className="w-full" onClick={() => setIsProposeOpen(true)}>
          + {t("proposeHeading")}
        </Button>
      )}

      <Modal open={isProposeOpen} onClose={() => setIsProposeOpen(false)}>
        <div className="flex flex-col gap-2">
          <p className="font-display text-lg font-bold text-foreground">{t("proposeHeading")}</p>
          {proposeSuccess && (
            <p className="text-sm text-accent-mint">{t(isAdmin ? "proposeSuccessAdmin" : "proposeSuccess")}</p>
          )}
          <input
            type="text"
            value={proposeQuestion}
            onChange={(e) => {
              setProposeQuestion(e.target.value);
              setProposeSuccess(false);
            }}
            placeholder={t("proposeQuestionPlaceholder")}
            className="rounded-konfeti border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
          <div className="flex flex-col gap-2">
            {proposeOptions.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={option}
                  onChange={(e) => {
                    const next = [...proposeOptions];
                    next[index] = e.target.value;
                    setProposeOptions(next);
                    setProposeSuccess(false);
                  }}
                  placeholder={t("proposeOptionPlaceholder", { index: index + 1 })}
                  aria-label={t("proposeOptionAria", { index: index + 1 })}
                  className="flex-1 rounded-konfeti border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
                {proposeOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setProposeOptions(proposeOptions.filter((_, i) => i !== index))}
                    className="text-xs font-semibold text-accent-coral"
                  >
                    {t("removeProposeOption")}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setProposeOptions([...proposeOptions, ""])}
              className="self-start text-xs font-semibold text-primary"
            >
              + {t("addProposeOption")}
            </button>
          </div>
          <Button size="sm" disabled={isPending} onClick={handlePropose}>
            {t("proposeSubmit")}
          </Button>
        </div>
      </Modal>

      <Modal open={confirmingDeletePollId !== null} onClose={() => setConfirmingDeletePollId(null)}>
        <p className="text-center text-base text-foreground">{t("deletePollConfirmTitle")}</p>
        <div className="flex gap-2">
          <Button
            variant="danger"
            disabled={isPending}
            onClick={() => confirmingDeletePollId && handleDeletePoll(confirmingDeletePollId)}
          >
            {t("deletePollConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingDeletePollId(null)}>
            {t("deletePollConfirmNo")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
