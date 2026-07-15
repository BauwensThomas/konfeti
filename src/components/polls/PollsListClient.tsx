"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { approvePoll, proposePoll, rejectPoll, setPollVote } from "@/app/[locale]/actions/polls";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";

export type PollOptionView = {
  id: string;
  label: string;
  totalQuantity: number;
  // Quantité déjà allouée par le viewer à CETTE option (0 = pas votée).
  myQuantity: number;
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
  // "single" (menu resto...) : budget partagé "1 + accompagnants" à répartir
  // entre les options. "multiple" (comportement historique) : cases à cocher
  // sans limite (retour Thomas : "je sais voter pour les 3 c'est un
  // problème... j'ai le droit qu'à un menu").
  choiceMode: "single" | "multiple";
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
  viewerBudget,
  isAdmin,
  initialPolls,
  readOnly = false,
  hideApprovedList = false,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  // Budget de vote pour un sondage "choix unique" : 1 (le viewer) + ses
  // accompagnants (voir PollsList.tsx). Sans objet pour un sondage "choix
  // multiple", jamais utilisé dans ce cas.
  viewerBudget: number;
  isAdmin: boolean;
  initialPolls: PollView[];
  // Événement terminé (brief 4.11, retour Thomas) : garde les résultats,
  // mais plus aucun vote/proposition possible.
  readOnly?: boolean;
  // Retour Thomas : organisateur/porteur de cagnotte ayant répondu "je ne
  // peux pas" -- garde la modération (approuver/refuser, jamais concerné par
  // ce flag) mais n'a plus besoin de voir la liste déjà approuvée (il ne
  // vient pas, voter sur le menu du resto n'a plus de sens pour lui).
  hideApprovedList?: boolean;
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
  const [proposeChoiceMode, setProposeChoiceMode] = useState<"single" | "multiple">("multiple");
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
  // revalidation ne confirment la vraie valeur), sinon la case à cocher /
  // le compteur "rebondit" à son ancien état le temps de l'aller-retour
  // serveur -- bug réel trouvé en testant (la case se décochait aussitôt
  // cliquée), même correctif que `DatePollVoting.tsx` pour le sondage de
  // date.
  const [optimisticPolls, setOptimisticVote] = useOptimistic(
    initialPolls,
    (state, { optionId, quantity }: { optionId: string; quantity: number }) =>
      state.map((poll) => ({
        ...poll,
        options: poll.options.map((option) =>
          option.id === optionId
            ? { ...option, myQuantity: quantity, totalQuantity: option.totalQuantity - option.myQuantity + quantity }
            : option,
        ),
      })),
  );

  const approvedPolls = optimisticPolls.filter((poll) => poll.status === "approved");
  const pendingPolls = optimisticPolls.filter((poll) => poll.status === "pending");

  function handleVote(optionId: string, quantity: number) {
    if (!viewerRsvpId) return;
    setError(null);
    startTransition(async () => {
      setOptimisticVote({ optionId, quantity });
      const result = await setPollVote(eventId, viewerRsvpId, shortCode, { optionId, quantity });
      if (!result.ok) {
        setError(result.error === "quota_exceeded" ? t("quotaExceeded") : t("errorUnknown"));
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
        choiceMode: proposeChoiceMode,
      });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      setProposeQuestion("");
      setProposeOptions(["", ""]);
      setProposeChoiceMode("multiple");
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
      {!readOnly && isAdmin && pendingPolls.length > 0 && (
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

      {hideApprovedList ? null : approvedPolls.length === 0 ? (
        <p className="text-center text-sm text-foreground/60">{t("empty")}</p>
      ) : (
        approvedPolls.map((poll) => {
          const isSingle = poll.choiceMode === "single";
          const allocated = poll.options.reduce((sum, o) => sum + o.myQuantity, 0);
          const remaining = viewerBudget - allocated;
          return (
            <div key={poll.id} className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
              <p className="font-display text-lg font-bold text-foreground">{poll.question}</p>
              {/* Quota "choix unique" (retour Thomas) : budget partagé entre
                  toutes les options de CE sondage, pas un vote par option.
                  Si le budget a diminué après coup (retour Thomas : "je
                  retire un accompagnant, comment savoir lequel vote
                  retirer ?") -- personne ne peut deviner à la place de la
                  personne quel choix retirer, donc on ne retire rien tout
                  seul : juste un avertissement clair, le -/+ reste
                  utilisable pour choisir soi-même lequel réduire. */}
              {!readOnly && isSingle && viewerRsvpId && (
                <p
                  className={`text-xs font-semibold ${remaining < 0 ? "text-accent-coral" : "text-foreground/60"}`}
                >
                  {remaining < 0 ? t("budgetExceeded", { count: -remaining }) : t("budgetRemaining", { count: remaining })}
                </p>
              )}
              {/* Grille à 3 colonnes fixes (label / contrôle / pastille de
                  votes) plutôt qu'un simple `flex justify-between` (retour
                  Thomas : "aligne ça bien"/"ce n'est toujours pas bien
                  aligné") -- la grille doit être partagée par la `<ul>`
                  ENTIÈRE (`display: contents` sur chaque `<li>`, qui devient
                  transparente pour la grille et laisse ses enfants devenir
                  des cellules directes) : une grille par `<li>` séparée,
                  comme au premier essai, recalcule ses propres largeurs de
                  colonne indépendamment ligne par ligne, donc rien ne
                  s'aligne réellement d'une option à l'autre. */}
              <ul className="grid grid-cols-[1fr_5.5rem_auto] items-center gap-x-3 gap-y-2">
                {poll.options.map((option) => (
                  <li key={option.id} className="contents">
                    <span className="min-w-0 truncate text-sm text-foreground">{option.label}</span>
                    {readOnly ? (
                      <span className="text-xs font-semibold text-accent-mint">
                        {option.myQuantity > 0 && `✓${option.myQuantity > 1 ? ` x${option.myQuantity}` : ""}`}
                      </span>
                    ) : isSingle ? (
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          disabled={isPending || !viewerRsvpId || option.myQuantity <= 0}
                          onClick={() => handleVote(option.id, option.myQuantity - 1)}
                          aria-label={t("decreaseVote", { label: option.label })}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-bold text-foreground disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="w-4 shrink-0 text-center text-sm font-semibold text-foreground">
                          {option.myQuantity}
                        </span>
                        <button
                          type="button"
                          disabled={isPending || !viewerRsvpId || remaining <= 0}
                          onClick={() => handleVote(option.id, option.myQuantity + 1)}
                          aria-label={t("increaseVote", { label: option.label })}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-sm font-bold text-foreground disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-3 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={option.myQuantity > 0}
                          disabled={isPending || !viewerRsvpId}
                          onChange={(e) => handleVote(option.id, e.target.checked ? 1 : 0)}
                        />
                      </label>
                    )}
                    <span className="justify-self-end whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {t("voteCount", { count: option.totalQuantity })}
                    </span>
                  </li>
                ))}
              </ul>
              {/* Retour Thomas : "les admins ou organisateur doivent avoir la
                  possibilité de supprimer le sondage" -- pas seulement refuser
                  une proposition encore en attente. */}
              {!readOnly && isAdmin && (
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
          );
        })
      )}

      {/* Proposition de sondage par un invité, dans un popup plutôt que
          toujours déplié (retour Thomas : trop de place prise sur mobile une
          fois empilé avec "qui apporte quoi") -- visible à tout participant
          approuvé non masqué (même condition que le vote : `viewerRsvpId`
          n'existe que dans ce cas). */}
      {/* Retour Thomas : "il peut juste accepter ou refuser les sondages" --
          proposer un nouveau sondage n'a pas de sens pour qui ne vient pas
          (même garde que la liste approuvée ci-dessus, `hideApprovedList`). */}
      {!readOnly && viewerRsvpId && !hideApprovedList && (
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
          {/* "Choix unique" (menu resto...) vs "choix multiple" (retour
              Thomas : "je sais voter pour les 3... j'ai le droit qu'à un
              menu"). */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setProposeChoiceMode("multiple")}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                proposeChoiceMode === "multiple" ? "bg-primary text-white" : "bg-surface text-foreground/70"
              }`}
            >
              {t("choiceModeMultiple")}
            </button>
            <button
              type="button"
              onClick={() => setProposeChoiceMode("single")}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                proposeChoiceMode === "single" ? "bg-primary text-white" : "bg-surface text-foreground/70"
              }`}
            >
              {t("choiceModeSingle")}
            </button>
          </div>
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
