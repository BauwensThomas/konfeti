"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  approveBringItem,
  claimBringItem,
  deleteBringClaim,
  deleteBringItem,
  mergeBringItemProposal,
  proposeBringItem,
  rejectBringItem,
  toggleBringBrought,
  updateBringItemQuantity,
} from "@/app/[locale]/actions/bring";
import { BringGauge, formatQuantity, type BringUnit } from "@/components/bring/BringGauge";
import { UnitPickerButton } from "@/components/bring/UnitPickerButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";

export type BringClaimView = {
  id: string;
  rsvpId: string;
  quantity: number;
  brought: boolean;
  name: string;
  isMine: boolean;
};

export type BringItemView = {
  id: string;
  label: string;
  unit: BringUnit;
  quantityNeeded: number;
  // Proposition d'item par un invité (brief 4.4, retour Thomas), modérée par
  // l'admin -- `status` vaut toujours 'approved' pour un item défini au
  // wizard (comportement historique). `proposedByName` est `null` pour un
  // item créé par l'organisateur (jamais proposé par quelqu'un).
  status: "pending" | "approved";
  proposedByName: string | null;
  claims: BringClaimView[];
};

// Panneau "qui apporte quoi" (brief 4.4). Contrairement à ChatRoom (état
// local fusionné message par message, fréquence élevée), on suit ici le même
// pattern que la liste Personnes : Realtime (souscription toujours montée
// dans EventTabs.tsx, pas ici -- couvre aussi bien ce panneau que la version
// compacte de l'Accueil) ne sert qu'à savoir QU'IL FAUT rafraîchir via
// `router.refresh()`, qui recharge BringList (Server Component) avec des
// données fraîches -- plus simple qu'une fusion d'état locale, largement
// suffisant pour la fréquence de changement attendue ici.
export function BringListClient({
  eventId,
  shortCode,
  viewerRsvpId,
  isAdmin,
  initialItems,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  initialItems: BringItemView[];
}) {
  const t = useTranslations("Bring");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Proposition d'item par un invité (brief 4.4, retour Thomas : "tous les
  // utilisateurs peuvent rajouter des produits qui ne sont pas dans la
  // liste"), état du petit formulaire dédié.
  const [proposeLabel, setProposeLabel] = useState("");
  const [proposeQuantity, setProposeQuantity] = useState("");
  const [proposeUnit, setProposeUnit] = useState<BringUnit | "">("");
  const [proposeSuccess, setProposeSuccess] = useState(false);

  // Retour Thomas : le message restait affiché indéfiniment, y compris une
  // fois la proposition déjà validée par l'organisateur -- un message de
  // confirmation transitoire, pas un statut permanent (même logique que les
  // toasts, auto-disparition après quelques secondes).
  useEffect(() => {
    if (!proposeSuccess) return;
    const timeout = setTimeout(() => setProposeSuccess(false), 5000);
    return () => clearTimeout(timeout);
  }, [proposeSuccess]);

  // Fusion d'une proposition en double dans un item déjà existant (retour
  // Thomas : "l'admin doit pouvoir choisir... si quelqu'un a déjà proposé ce
  // produit") -- popup listant les items déjà approuvés, même pattern que
  // `UnitPickerButton` (bouton + `Modal`).
  const [mergePickerForItemId, setMergePickerForItemId] = useState<string | null>(null);

  // Edition/suppression admin d'un item déjà approuvé (retour Thomas : "les
  // admins ou l'organisateur devrait pouvoir modifier la quantité ou
  // supprimer directement l'objet") -- brouillon de quantité séparé de
  // `quantityDrafts` (qui porte la réclamation PERSONNELLE du viewer, pas la
  // quantité demandée par l'item lui-même).
  const [itemQuantityDrafts, setItemQuantityDrafts] = useState<Record<string, string>>({});
  const [confirmingDeleteItemId, setConfirmingDeleteItemId] = useState<string | null>(null);

  const approvedItems = initialItems.filter((item) => item.status === "approved");
  const pendingItems = initialItems.filter((item) => item.status === "pending");

  function myClaim(item: BringItemView) {
    return item.claims.find((c) => c.isMine);
  }

  function handleClaim(item: BringItemView) {
    if (!viewerRsvpId) return;
    setError(null);
    const draft = quantityDrafts[item.id];
    const quantity = draft !== undefined ? Number(draft) : (myClaim(item)?.quantity ?? 1);
    if (!quantity || quantity <= 0) return;
    startTransition(async () => {
      const result = await claimBringItem(eventId, shortCode, viewerRsvpId, {
        itemId: item.id,
        quantity,
      });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handleRemoveClaim(item: BringItemView) {
    if (!viewerRsvpId) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBringClaim(shortCode, viewerRsvpId, { itemId: item.id });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handleToggleBrought(claimId: string, brought: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await toggleBringBrought(shortCode, { claimId, brought });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handlePropose() {
    if (!viewerRsvpId || !proposeUnit) return;
    const quantity = Number(proposeQuantity);
    if (!proposeLabel.trim() || !quantity || quantity <= 0) return;
    setError(null);
    setProposeSuccess(false);
    startTransition(async () => {
      const result = await proposeBringItem(eventId, shortCode, viewerRsvpId, {
        label: proposeLabel.trim(),
        unit: proposeUnit,
        quantityNeeded: quantity,
      });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      setProposeLabel("");
      setProposeQuantity("");
      setProposeUnit("");
      setProposeSuccess(true);
      router.refresh();
    });
  }

  function handleApprove(itemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await approveBringItem(shortCode, itemId);
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handleReject(itemId: string) {
    setError(null);
    startTransition(async () => {
      const result = await rejectBringItem(shortCode, itemId);
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handleMerge(pendingItemId: string, targetItemId: string) {
    setError(null);
    setMergePickerForItemId(null);
    startTransition(async () => {
      const result = await mergeBringItemProposal(shortCode, { pendingItemId, targetItemId });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handleUpdateQuantity(item: BringItemView) {
    const draft = itemQuantityDrafts[item.id];
    if (draft === undefined) return;
    const quantityNeeded = Number(draft);
    if (!quantityNeeded || quantityNeeded <= 0) return;
    setError(null);
    startTransition(async () => {
      const result = await updateBringItemQuantity(shortCode, { itemId: item.id, quantityNeeded });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      setItemQuantityDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      router.refresh();
    });
  }

  function handleDeleteItem(itemId: string) {
    setError(null);
    setConfirmingDeleteItemId(null);
    startTransition(async () => {
      const result = await deleteBringItem(shortCode, itemId);
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}

      {/* Modération admin (brief 4.4, retour Thomas) : n'apparaît que pour un
          admin (RLS ne renvoie de toute façon les items 'pending' qu'à un
          admin -- `pendingItems` reste structurellement vide pour tout
          autre viewer, ce garde-fou `isAdmin` est une défense en
          profondeur, pas la seule protection). */}
      {isAdmin && pendingItems.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-display text-lg font-bold text-foreground">{t("pendingSectionTitle")}</p>
          {pendingItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
              <p className="text-sm font-semibold text-foreground">
                {item.label} : {formatQuantity(item.quantityNeeded, item.unit)}
              </p>
              {item.proposedByName && (
                <p className="text-xs text-foreground/60">{t("proposedBy", { name: item.proposedByName })}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={isPending} onClick={() => handleApprove(item.id)}>
                  {t("approve")}
                </Button>
                {approvedItems.length > 0 && (
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => setMergePickerForItemId(item.id)}>
                    {t("merge")}
                  </Button>
                )}
                <Button size="sm" variant="danger" disabled={isPending} onClick={() => handleReject(item.id)}>
                  {t("reject")}
                </Button>
              </div>
              <Modal open={mergePickerForItemId === item.id} onClose={() => setMergePickerForItemId(null)}>
                <p className="font-display text-base font-bold text-foreground">{t("mergeHeading")}</p>
                <div className="flex flex-col gap-1">
                  {approvedItems.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => handleMerge(item.id, target.id)}
                      className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
              </Modal>
            </div>
          ))}
        </div>
      )}

      {approvedItems.length === 0 ? (
        <p className="text-center text-sm text-foreground/60">{t("empty")}</p>
      ) : (
        approvedItems.map((item) => {
        const claimed = item.claims.reduce((sum, c) => sum + c.quantity, 0);
        const mine = myClaim(item);
        return (
          <div key={item.id} className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
            <BringGauge label={item.label} claimed={claimed} needed={item.quantityNeeded} unit={item.unit} />
            {isAdmin && (
              <div className="flex flex-col gap-1 rounded-konfeti bg-canvas p-2">
                <span className="text-xs font-semibold text-foreground/60">{t("editQuantityLabel")}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={itemQuantityDrafts[item.id] ?? item.quantityNeeded.toString()}
                    onChange={(e) => setItemQuantityDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    aria-label={t("editQuantityLabel")}
                    className="w-20 rounded-konfeti border border-border bg-surface px-2 py-1 text-sm text-foreground"
                  />
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => handleUpdateQuantity(item)}>
                    {t("saveQuantity")}
                  </Button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setConfirmingDeleteItemId(item.id)}
                    className="text-xs font-semibold text-accent-coral"
                  >
                    {t("deleteItem")}
                  </button>
                </div>
              </div>
            )}
            {item.claims.length > 0 && (
              <ul className="flex flex-col gap-1">
                {item.claims.map((claim) => (
                  <li key={claim.id} className="flex items-center justify-between gap-2 text-xs text-foreground/70">
                    <span>
                      {claim.name} : {formatQuantity(claim.quantity, item.unit)}
                    </span>
                    {isAdmin && (
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={claim.brought}
                          disabled={isPending}
                          onChange={(e) => handleToggleBrought(claim.id, e.target.checked)}
                        />
                        {t("broughtLabel")}
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {viewerRsvpId && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-foreground/60">{t("myClaimLabel")}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={quantityDrafts[item.id] ?? mine?.quantity?.toString() ?? "1"}
                    onChange={(e) => setQuantityDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    aria-label={t("myClaimLabel")}
                    className="w-20 rounded-konfeti border border-border bg-surface px-2 py-1 text-sm text-foreground"
                  />
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => handleClaim(item)}>
                    {mine ? t("updateMyClaim") : t("addMyClaim")}
                  </Button>
                  {mine && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleRemoveClaim(item)}
                      className="text-xs font-semibold text-accent-coral"
                    >
                      {t("removeMyClaim")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
        })
      )}

      {/* Proposition d'item par un invité (brief 4.4, retour Thomas) --
          visible à tout participant approuvé non masqué (même condition
          que la réclamation d'un item existant : `viewerRsvpId` n'existe
          que dans ce cas, voir page.tsx/EventChat.tsx pour le pattern déjà
          établi). */}
      {viewerRsvpId && (
        <div className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
          <p className="font-display text-lg font-bold text-foreground">{t("proposeHeading")}</p>
          {proposeSuccess && <p className="text-sm text-accent-mint">{t("proposeSuccess")}</p>}
          <input
            type="text"
            value={proposeLabel}
            onChange={(e) => {
              setProposeLabel(e.target.value);
              setProposeSuccess(false);
            }}
            placeholder={t("proposeLabelPlaceholder")}
            className="rounded-konfeti border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="any"
              value={proposeQuantity}
              onChange={(e) => {
                setProposeQuantity(e.target.value);
                setProposeSuccess(false);
              }}
              aria-label={t("proposeQuantityAria")}
              className="flex-1 rounded-konfeti border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
            <UnitPickerButton
              value={proposeUnit}
              onChange={(unit) => {
                setProposeUnit(unit);
                setProposeSuccess(false);
              }}
              unitLabels={{
                piece: t("unit.piece"),
                liter: t("unit.liter"),
                gram: t("unit.gram"),
                kilogram: t("unit.kilogram"),
              }}
              placeholder={t("proposeUnitPlaceholder")}
              ariaLabel={t("proposeUnitAria")}
              className="flex-1 rounded-konfeti border border-border bg-surface px-3 py-2 text-left text-sm text-foreground"
            />
          </div>
          <Button size="sm" disabled={isPending} onClick={handlePropose}>
            {t("proposeSubmit")}
          </Button>
        </div>
      )}

      <Modal open={confirmingDeleteItemId !== null} onClose={() => setConfirmingDeleteItemId(null)}>
        <p className="text-center text-base text-foreground">{t("deleteItemConfirmTitle")}</p>
        <div className="flex gap-2">
          <Button
            variant="danger"
            disabled={isPending}
            onClick={() => confirmingDeleteItemId && handleDeleteItem(confirmingDeleteItemId)}
          >
            {t("deleteItemConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingDeleteItemId(null)}>
            {t("deleteItemConfirmNo")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
