"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  approveRsvp,
  removeParticipant,
  setParticipantRole,
  grantPotAccess,
  denyPotAccess,
  revokePotAccess,
} from "@/app/[locale]/actions/participants";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";

export type ParticipantRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  status: "pending" | "approved" | "restricted";
  role: "guest" | "admin" | "beneficiary";
  answer: "yes" | "maybe" | "no";
  companionsCount: number;
  potAccessGranted: boolean;
  wantsPotAccess: boolean;
};

export function ParticipantsList({
  shortCode,
  viewerRsvpId,
  isAdmin,
  potEnabled,
  rows,
}: {
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  potEnabled: boolean;
  rows: ParticipantRow[];
}) {
  const t = useTranslations("Participants");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  // "restricted" ("je ne peux pas") a longtemps partagé la section "En
  // attente" avec "pending", mais `admin_approve_rsvp` (SQL) exige
  // `status = 'pending'` : les boutons "Approuver..." échouaient
  // silencieusement sur une ligne restricted (retour Thomas : pourquoi ces
  // gens finissent-ils dans "En attente" ?). Un participant restricted a
  // déjà un accès (rien, par défaut) sans validation admin — aucune action
  // requise, SAUF s'il a explicitement demandé à participer à la cagnotte
  // (wantsPotAccess) : ce cas précis redevient une vraie décision admin
  // (Approuver/Refuser), tout le reste de la section reste purement
  // informatif (retour Thomas : "il a accès à rien", pas besoin de le retirer).
  const pending = rows.filter((r) => r.status === "pending");
  const restricted = rows.filter((r) => r.status === "restricted");
  // Répondre "non" fait toujours sortir un participant du statut "approved"
  // (update_my_answer bascule immédiatement en "restricted", quel que soit le
  // statut de départ) : parmi les approuvés, seuls "yes"/"maybe" existent
  // encore. Séparés en deux sections distinctes (retour Thomas) pour
  // distinguer les venues confirmées des incertaines d'un coup d'œil.
  const approvedYes = rows.filter((r) => r.status === "approved" && r.answer !== "maybe");
  const approvedMaybe = rows.filter((r) => r.status === "approved" && r.answer === "maybe");

  // L'abonnement Realtime "rsvps" vit désormais dans EventTabs (toujours
  // monté, voir ce fichier) plutôt qu'ici : ce panneau se démonte avec le
  // reste de l'onglet Personnes en changeant d'onglet, et un changement de
  // participant doit se refléter partout, pas seulement quand ce panneau est
  // affiché (retour Thomas : "je ne veux pas devoir à chaque fois refresh").

  function handleApprove(rsvpId: string, role: "guest" | "beneficiary") {
    startTransition(async () => {
      await approveRsvp(rsvpId, shortCode, role);
      router.refresh();
    });
  }

  function handleRemove(rsvpId: string) {
    startTransition(async () => {
      await removeParticipant(rsvpId, shortCode);
      setConfirmingRemoveId(null);
      router.refresh();
    });
  }

  function handleRoleChange(rsvpId: string, role: "guest" | "admin" | "beneficiary") {
    setRoleError(null);
    startTransition(async () => {
      const result = await setParticipantRole(rsvpId, shortCode, role);
      if (!result.ok) {
        setRoleError(result.error === "last_admin" ? t("errorLastAdmin") : t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handleGrantPotAccess(rsvpId: string) {
    startTransition(async () => {
      await grantPotAccess(rsvpId, shortCode);
      router.refresh();
    });
  }

  function handleDenyPotAccess(rsvpId: string) {
    startTransition(async () => {
      await denyPotAccess(rsvpId, shortCode);
      router.refresh();
    });
  }

  function handleRevokePotAccess(rsvpId: string) {
    startTransition(async () => {
      await revokePotAccess(rsvpId, shortCode);
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-6">
      {roleError && (
        <p role="alert" className="text-sm text-accent-coral">
          {roleError}
        </p>
      )}
      {isAdmin && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">
            {t("pendingSectionTitle")}
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-foreground/60">{t("pendingEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 rounded-konfeti border border-border p-3"
                >
                  <ParticipantIdentity
                    row={row}
                    companionsLabel={t("companionsCount", { count: row.companionsCount })}
                    answerLabel={answerLabel(row.answer, t)}
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled={isPending}
                      onClick={() => handleApprove(row.id, "guest")}
                    >
                      {t("approveAsGuest")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled={isPending}
                      onClick={() => handleApprove(row.id, "beneficiary")}
                    >
                      {t("approveAsBeneficiary")}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="w-full"
                      disabled={isPending}
                      onClick={() => setConfirmingRemoveId(row.id)}
                    >
                      {t("reject")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isAdmin && restricted.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">
            {t("restrictedSectionTitle")}
          </h2>
          <ul className="flex flex-col gap-2">
            {restricted.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-konfeti border border-border p-3"
              >
                <ParticipantIdentity
                  row={row}
                  companionsLabel={t("companionsCount", { count: row.companionsCount })}
                  answerLabel={answerLabel(row.answer, t)}
                />
                {potEnabled && row.wantsPotAccess && !row.potAccessGranted && (
                  // Seul cas où cette section demande une vraie décision
                  // admin : le participant a explicitement demandé à
                  // participer à la cagnotte, symétrique de "En attente"
                  // (Approuver/Refuser), sans jamais retirer l'événement lui-même.
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled={isPending}
                      onClick={() => handleGrantPotAccess(row.id)}
                    >
                      {t("grantPotAccess")}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="w-full"
                      disabled={isPending}
                      onClick={() => handleDenyPotAccess(row.id)}
                    >
                      {t("reject")}
                    </Button>
                  </div>
                )}
                {potEnabled && row.potAccessGranted && (
                  <div className="flex flex-col gap-1">
                    <p className="text-center text-xs font-semibold text-foreground/60">
                      {t("potAccessGranted")}
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      className="w-full"
                      disabled={isPending}
                      onClick={() => handleRevokePotAccess(row.id)}
                    >
                      {t("revokePotAccess")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">
          {t("approvedSectionTitle")}
        </h2>
        <ul className="flex flex-col gap-2">
          {approvedYes.map((row) => (
            <ApprovedParticipantRow
              key={row.id}
              row={row}
              isSelf={row.id === viewerRsvpId}
              isAdmin={isAdmin}
              isPending={isPending}
              t={t}
              onRoleChange={handleRoleChange}
              onRemove={setConfirmingRemoveId}
            />
          ))}
        </ul>
      </section>

      {approvedMaybe.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">{t("maybeSectionTitle")}</h2>
          <ul className="flex flex-col gap-2">
            {approvedMaybe.map((row) => (
              <ApprovedParticipantRow
                key={row.id}
                row={row}
                isSelf={row.id === viewerRsvpId}
                isAdmin={isAdmin}
                isPending={isPending}
                t={t}
                onRoleChange={handleRoleChange}
                onRemove={setConfirmingRemoveId}
              />
            ))}
          </ul>
        </section>
      )}

      <Modal open={confirmingRemoveId !== null} onClose={() => setConfirmingRemoveId(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, voir CancelEventButton */}
        <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
        <p className="text-center text-base text-foreground">{t("removeConfirmTitle")}</p>
        <div className="flex justify-center gap-3">
          <Button
            disabled={isPending}
            onClick={() => confirmingRemoveId && handleRemove(confirmingRemoveId)}
          >
            {t("removeConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingRemoveId(null)}>
            {t("removeConfirmNo")}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function ApprovedParticipantRow({
  row,
  isSelf,
  isAdmin,
  isPending,
  t,
  onRoleChange,
  onRemove,
}: {
  row: ParticipantRow;
  isSelf: boolean;
  isAdmin: boolean;
  isPending: boolean;
  t: ReturnType<typeof useTranslations>;
  onRoleChange: (rsvpId: string, role: "guest" | "admin" | "beneficiary") => void;
  onRemove: (rsvpId: string) => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
      <ParticipantIdentity
        row={row}
        companionsLabel={t("companionsCount", { count: row.companionsCount })}
        roleLabel={isAdmin ? roleLabel(row.role, t) : undefined}
      />
      {isAdmin && !isSelf && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={row.role}
            disabled={isPending}
            onChange={(e) => onRoleChange(row.id, e.target.value as "guest" | "admin" | "beneficiary")}
            className="rounded-konfeti border border-border bg-surface px-2 py-1 text-sm text-foreground"
          >
            <option value="guest">{t("roleGuest")}</option>
            <option value="admin">{t("roleAdmin")}</option>
            <option value="beneficiary">{t("roleBeneficiary")}</option>
          </select>
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            className="text-sm font-semibold text-accent-coral"
          >
            {t("remove")}
          </button>
        </div>
      )}
    </li>
  );
}

function ParticipantIdentity({
  row,
  companionsLabel,
  roleLabel,
  answerLabel,
}: {
  row: ParticipantRow;
  companionsLabel: string;
  roleLabel?: string;
  answerLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
        {row.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar utilisateur (preset local ou photo signée), pas besoin de l'optimiseur next/image
          <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <AvatarPlaceholder className="h-full w-full rounded-full" compact />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">
          {row.firstName} {row.lastName}
          {row.companionsCount > 0 ? ` ${companionsLabel}` : ""}
        </span>
        {(roleLabel || answerLabel) && (
          <span className="text-xs text-foreground/60">{roleLabel ?? answerLabel}</span>
        )}
        {/* Numero visible seulement pour un admin (retour Thomas) : `row.phone`
            n'est de toute facon jamais rempli cote serveur pour un non-admin
            (voir EventPersonnes.tsx), rien a re-verifier ici. */}
        {row.phone && <span className="text-xs text-foreground/60">{row.phone}</span>}
      </div>
    </div>
  );
}

function roleLabel(role: "guest" | "admin" | "beneficiary", t: ReturnType<typeof useTranslations>) {
  if (role === "admin") return t("roleAdmin");
  if (role === "beneficiary") return t("roleBeneficiary");
  return t("roleGuest");
}

// Réponse RSVP affichée sur la file d'attente (retour Thomas : "je veux voir
// le rôle de la personne dans Personnes" — en attente d'approbation, il n'y
// a pas encore de rôle assigné, seule la réponse "je viens"/"peut-être"/"je
// ne peux pas" existe déjà et donne un vrai contexte pour approuver ou non).
function answerLabel(answer: "yes" | "maybe" | "no", t: ReturnType<typeof useTranslations>) {
  if (answer === "yes") return t("answerYes");
  if (answer === "maybe") return t("answerMaybe");
  return t("answerNo");
}
