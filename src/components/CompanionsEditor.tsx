"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addCompanion, removeCompanion } from "@/app/[locale]/actions/participants";
import { claimBringItem, deleteBringClaim } from "@/app/[locale]/actions/bring";
import { setPollVote } from "@/app/[locale]/actions/polls";
import { formatQuantity, type BringUnit } from "@/lib/bring-units";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

type CompanionKind = "partner" | "child" | "friend" | "family";
type Companion = { id: string; kind: CompanionKind; firstName: string | null };
type Claim = { itemId: string; label: string; unit: BringUnit; quantity: number };
type Vote = { optionId: string; pollId: string; pollQuestion: string; optionLabel: string; quantity: number };

// Ajout/retrait d'accompagnants après l'inscription (retour Thomas : "si une
// personne inscrite, ne peut pas rajouter par après des +1 ou retirer" --
// jusqu'ici, `companions` n'était modifiable qu'à l'inscription elle-même,
// via `GuestIdentityForm`). La RLS `companions_write_own` autorisait déjà
// cette écriture à tout moment ; seule l'UI manquait. Affiché uniquement si
// `event.allow_companions` (voir page.tsx).
export function CompanionsEditor({
  rsvpId,
  eventId,
  shortCode,
  initialCompanions,
  viewerClaims,
  viewerVotes,
}: {
  rsvpId: string;
  eventId: string;
  shortCode: string;
  initialCompanions: Companion[];
  // Engagements déjà pris par le viewer (retour Thomas : "quand on clic sur
  // supprimer un accompagnant, si l'utilisateur a rajouté des produits à
  // ramener ou répondu à des sondages, qu'on demande qu'est-ce qu'il faut
  // retirer") -- montrés au moment précis du retrait, jamais touchés
  // automatiquement (personne ne peut deviner à la place de la personne quel
  // engagement correspondait à cet accompagnant précis).
  viewerClaims: Claim[];
  viewerVotes: Vote[];
}) {
  const t = useTranslations("GuestIdentity");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<CompanionKind>("partner");
  const [newFirstName, setNewFirstName] = useState("");
  // Popup de choix de type d'accompagnant (retour Thomas : "j'aimerais que
  // tout ce qui est liste devienne des popups comme le reste du projet") --
  // imbriquée dans le popup "Ajouter un accompagnant" (`position: fixed`,
  // aucun souci d'empilement, même principe que les Modal existantes).
  const [kindPickerOpen, setKindPickerOpen] = useState(false);
  const [removingCompanion, setRemovingCompanion] = useState<Companion | null>(null);
  // Quantité à retirer par réclamation, saisie librement (retour Thomas :
  // "ce n'est pas mieux de demander la quantité à retirer ?" -- plutôt qu'un
  // "-1" arbitraire sur une unité continue comme le kg). "Zéro de base"
  // (retour Thomas) : rien n'est retiré par défaut, contrairement au premier
  // essai qui pré-remplissait avec le total.
  const [claimAmounts, setClaimAmounts] = useState<Record<string, string>>({});
  // Votes "cochés" pour retrait, appliqués seulement au clic final sur
  // "Confirmer le retrait" -- pas immédiatement au clic sur "Retirer 1x"
  // (retour Thomas : "pouvoir cliquer et décliquer sur retirer et puis
  // confirmer le retrait... ici j'ai cliqué sur retirer et ça m'a
  // directement retiré sans confirmer"). Re-cliquer décoche (même geste que
  // JourJActions : un bouton bascule, jamais figé une fois cliqué). Pas de
  // coche équivalente pour "qui apporte quoi" : la quantité tapée EST déjà
  // le signal (voir `handleConfirmRemove`) -- une coche séparée en plus de
  // la quantité s'est révélée facile à oublier (retour Thomas : "j'ai coché
  // 1.2... et c'est resté à 1.5").
  const [stagedVoteIds, setStagedVoteIds] = useState<Set<string>>(new Set());

  function openAdd() {
    setError(null);
    setNewKind("partner");
    setNewFirstName("");
    setAdding(true);
  }

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addCompanion(rsvpId, shortCode, { kind: newKind, firstName: newFirstName.trim() || undefined });
      if (result.ok) {
        setAdding(false);
        router.refresh();
      } else if (result.error === "not_authenticated") {
        notifySessionExpired();
      } else {
        setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
      }
    });
  }

  function openRemove(c: Companion) {
    setError(null);
    setClaimAmounts({});
    setStagedVoteIds(new Set());
    setRemovingCompanion(c);
  }

  function closeRemove() {
    setRemovingCompanion(null);
    setClaimAmounts({});
    setStagedVoteIds(new Set());
  }

  function toggleVoteStaged(optionId: string) {
    setStagedVoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) next.delete(optionId);
      else next.add(optionId);
      return next;
    });
  }

  // Applique d'abord les réclamations/votes cochés, puis retire
  // l'accompagnant -- tout en un seul geste de confirmation (retour Thomas :
  // "comme ça ça mettra tout à jour directement sans avoir d'erreur dans les
  // sondages"). Pour "qui apporte quoi", pas de coche séparée (retour
  // Thomas : "j'ai coché 1.2... et c'est resté à 1.5" -- coche ET quantité
  // étaient deux signaux distincts, facile d'oublier l'un des deux) : la
  // quantité tapée EST le signal, "0" ne fait rien. Si une réclamation/un
  // vote échoue, on continue quand même le retrait de l'accompagnant (la
  // vraie action demandée) mais on le signale, plutôt que de rester
  // silencieux sur un ajustement qui n'a pas pu s'appliquer.
  function handleConfirmRemove() {
    if (!removingCompanion) return;
    const companionId = removingCompanion.id;
    setError(null);
    startTransition(async () => {
      let adjustmentFailed = false;

      for (const claim of viewerClaims) {
        const amount = Number(claimAmounts[claim.itemId] ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const remaining = claim.quantity - amount;
        const result =
          remaining > 0
            ? await claimBringItem(eventId, shortCode, rsvpId, { itemId: claim.itemId, quantity: remaining })
            : await deleteBringClaim(shortCode, rsvpId, { itemId: claim.itemId });
        if (!result.ok) adjustmentFailed = true;
      }
      for (const vote of viewerVotes) {
        if (!stagedVoteIds.has(vote.optionId)) continue;
        const result = await setPollVote(eventId, rsvpId, shortCode, {
          optionId: vote.optionId,
          quantity: vote.quantity - 1,
        });
        if (!result.ok) adjustmentFailed = true;
      }

      const result = await removeCompanion(companionId, shortCode);
      if (result.ok) {
        closeRemove();
        if (adjustmentFailed) setError(t("companionRemoveAdjustmentFailed"));
        router.refresh();
      } else if (result.error === "not_authenticated") {
        notifySessionExpired();
      } else {
        setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-lg font-bold text-foreground">{t("myCompanionsHeading")}</p>
      {initialCompanions.length > 0 && (
        <ul className="flex flex-col gap-1">
          {initialCompanions.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm text-foreground">
              <span>
                {companionKindLabel(t, c.kind)}
                {c.firstName ? ` (${c.firstName})` : ""}
              </span>
              <button
                type="button"
                onClick={() => openRemove(c)}
                aria-label={t("companionRemove")}
                className="shrink-0 text-sm font-semibold text-accent-coral"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={openAdd} className="w-fit text-sm font-semibold text-primary">
        {t("companionAdd")}
      </button>

      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}

      <Modal open={adding} onClose={() => setAdding(false)}>
        <p className="font-display text-lg font-bold text-foreground">{t("companionAdd")}</p>
        <button
          type="button"
          onClick={() => setKindPickerOpen(true)}
          className="w-full rounded-konfeti border border-border bg-surface px-3 py-2.5 text-left text-base text-foreground"
        >
          {companionKindLabel(t, newKind)}
        </button>
        <input
          type="text"
          value={newFirstName}
          onChange={(e) => setNewFirstName(e.target.value)}
          placeholder={t("companionFirstNamePlaceholder")}
          className="w-full rounded-konfeti border border-border bg-surface px-3 py-2.5 text-base text-foreground placeholder:text-foreground/50"
        />
        <div className="flex justify-center gap-3">
          <Button disabled={isPending} onClick={handleAdd}>
            {t("companionAdd")}
          </Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>
            {t("leaveConfirmNo")}
          </Button>
        </div>
      </Modal>

      <Modal open={kindPickerOpen} onClose={() => setKindPickerOpen(false)}>
        <div className="flex flex-col gap-1">
          {(["partner", "child", "friend", "family"] as CompanionKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setNewKind(kind);
                setKindPickerOpen(false);
              }}
              className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
            >
              {companionKindLabel(t, kind)}
            </button>
          ))}
        </div>
      </Modal>

      {/* Retour Thomas : "qu'on demande qu'est-ce qu'il faut retirer... comme
          ça ça mettra tout à jour directement sans avoir d'erreur dans les
          sondages" -- récapitule "qui apporte quoi" + sondages déjà engagés
          par CETTE ligne rsvps au moment de retirer un accompagnant.
          "Retirer" ne fait que COCHER/décocher (retour Thomas : "pouvoir
          cliquer et décliquer sur retirer et puis confirmer le retrait" --
          rien n'est appliqué avant le clic final sur "Confirmer le
          retrait", qui applique tout d'un coup avec le retrait de
          l'accompagnant lui-même. */}
      <Modal open={removingCompanion !== null} onClose={closeRemove}>
        <p className="text-center text-base text-foreground">
          {removingCompanion &&
            t("companionRemoveConfirmTitle", {
              name: `${companionKindLabel(t, removingCompanion.kind)}${
                removingCompanion.firstName ? ` (${removingCompanion.firstName})` : ""
              }`,
            })}
        </p>

        {(viewerClaims.length > 0 || viewerVotes.length > 0) && (
          <div className="flex flex-col gap-3 rounded-konfeti bg-canvas p-3">
            <p className="text-xs text-foreground/70">{t("companionRemoveEngagementsHint")}</p>

            {viewerClaims.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  {t("companionRemoveBringHeading")}
                </p>
                {viewerClaims.map((claim) => {
                  const amount = Number(claimAmounts[claim.itemId] ?? 0);
                  const willRemove = Number.isFinite(amount) && amount > 0;
                  return (
                    <div key={claim.itemId} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {claim.label} : {formatQuantity(claim.quantity, claim.unit)}
                      </span>
                      {/* Quantité à retirer saisie librement plutôt qu'un
                          "-1" arbitraire (retour Thomas : "ce n'est pas
                          mieux de demander la quantité à retirer ?" -- une
                          unité continue comme le kg ne se découpe pas
                          naturellement "par personne"). "0" par défaut
                          (retour Thomas : "ça doit être zéro de base") --
                          la quantité tapée EST le signal de retrait, pas de
                          coche séparée à côté (retour Thomas : "j'ai coché
                          1.2... et c'est resté à 1.5", les deux signaux
                          distincts étaient faciles à désynchroniser). */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          step={claim.unit === "piece" ? 1 : 0.1}
                          value={claimAmounts[claim.itemId] ?? "0"}
                          onChange={(e) => setClaimAmounts((prev) => ({ ...prev, [claim.itemId]: e.target.value }))}
                          aria-label={t("companionRemoveAmountAria", { label: claim.label })}
                          className="w-16 rounded-konfeti border border-border bg-surface px-2 py-1 text-xs text-foreground"
                        />
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            willRemove ? "bg-accent-coral text-white" : "bg-accent-coral/10 text-accent-coral"
                          }`}
                        >
                          {t("companionRemoveDelete")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {viewerVotes.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  {t("companionRemovePollsHeading")}
                </p>
                {viewerVotes.map((vote) => {
                  const staged = stagedVoteIds.has(vote.optionId);
                  return (
                    <div key={vote.optionId} className="flex items-center justify-between gap-2">
                      {/* Quantité toujours affichée, même à x1 (retour
                          Thomas : "pour le plat du resto ce n'est pas mieux
                          de mettre retirer 1x ?") -- sans elle, le bouton
                          "retirer 1x" n'indiquait pas clairement de combien
                          partait le total affiché à côté. */}
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {vote.pollQuestion} : {vote.optionLabel} x{vote.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleVoteStaged(vote.optionId)}
                        aria-pressed={staged}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          staged ? "bg-primary text-white" : "bg-primary/10 text-primary"
                        }`}
                      >
                        {t("companionRemoveReduceVote")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-center gap-3">
          <Button variant="danger" disabled={isPending} onClick={handleConfirmRemove}>
            {t("companionRemoveConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={closeRemove}>
            {t("leaveConfirmNo")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function companionKindLabel(t: ReturnType<typeof useTranslations>, kind: CompanionKind): string {
  return {
    partner: t("companionKindPartner"),
    child: t("companionKindChild"),
    friend: t("companionKindFriend"),
    family: t("companionKindFamily"),
  }[kind];
}
