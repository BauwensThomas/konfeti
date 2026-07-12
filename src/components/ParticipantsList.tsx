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
  transferEventHost,
} from "@/app/[locale]/actions/participants";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { joinNames } from "@/lib/joinNames";

export type ParticipantRow = {
  id: string;
  profileId: string | null;
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
  // Mode Jour J (brief 4.11) : badges "Arrivé"/"Bien rentré", affichés
  // uniquement le jour même (voir `isJourJ` sur `ParticipantsList`).
  checkedInAt: string | null;
  arrivedHomeAt: string | null;
};

export function ParticipantsList({
  eventId,
  shortCode,
  viewerRsvpId,
  isAdmin,
  isHost,
  hostProfileId,
  potEnabled,
  rows,
  isBeneficiary,
  isParticipantsHidden,
  beneficiaryNames,
  isJourJ,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  hostProfileId: string;
  isHost: boolean;
  potEnabled: boolean;
  rows: ParticipantRow[];
  isBeneficiary: boolean;
  isParticipantsHidden: boolean;
  beneficiaryNames: string[];
  isJourJ: boolean;
}) {
  const t = useTranslations("Participants");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [confirmingTransferId, setConfirmingTransferId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

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
  // Nombre de PERSONNES, pas de lignes rsvps (retour Thomas : le compte entre
  // parenthèses doit inclure les accompagnants -- "chaises à placer" -- pas
  // juste compter les inscriptions).
  const approvedYesHeadcount = approvedYes.reduce((sum, r) => sum + 1 + r.companionsCount, 0);
  const approvedMaybeHeadcount = approvedMaybe.reduce((sum, r) => sum + 1 + r.companionsCount, 0);

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
    setRoleError(null);
    startTransition(async () => {
      const result = await removeParticipant(rsvpId, shortCode);
      setConfirmingRemoveId(null);
      // Filet de sécurité : ce cas ne devrait plus arriver via l'UI (le
      // bouton "Retirer" est déjà masqué sur la ligne de l'organisateur),
      // mais autant afficher l'erreur plutôt que l'ignorer en silence si un
      // état affiché était périmé.
      if (!result.ok) {
        setRoleError(result.error === "organizer_protected" ? t("errorOrganizerProtected") : t("errorUnknown"));
        return;
      }
      router.refresh();
    });
  }

  function handleRoleChange(rsvpId: string, role: "guest" | "admin" | "beneficiary") {
    setRoleError(null);
    startTransition(async () => {
      const result = await setParticipantRole(rsvpId, shortCode, role);
      if (!result.ok) {
        setRoleError(
          result.error === "last_admin"
            ? t("errorLastAdmin")
            : result.error === "organizer_protected"
              ? t("errorOrganizerProtected")
              : t("errorUnknown"),
        );
        return;
      }
      router.refresh();
    });
  }

  function handleTransferHost(newHostProfileId: string) {
    setTransferError(null);
    startTransition(async () => {
      const result = await transferEventHost(eventId, newHostProfileId, shortCode);
      setConfirmingTransferId(null);
      if (!result.ok) {
        setTransferError(t("errorUnknown"));
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
      {transferError && (
        <p role="alert" className="text-sm text-accent-coral">
          {transferError}
        </p>
      )}
      {/* Note "X a/n'a pas accès à la liste des participants" (retour Thomas :
          "il faut rajouter dans personnes que Julie a accès ou pas"), même
          principe partout où un bloc peut être masqué -- affichée dans LES
          DEUX SENS, jamais silencieuse, jamais au(x) bénéficiaire(s)
          concerné(s) eux-mêmes (qui voient de toute façon le placeholder
          dédié à la place de tout ce composant, voir page.tsx). */}
      {!isBeneficiary && beneficiaryNames.length > 0 && (
        <p
          className={`text-center text-xs font-semibold ${
            isParticipantsHidden ? "text-accent-coral" : "text-accent-mint"
          }`}
        >
          {t(isParticipantsHidden ? "beneficiaryNoAccessNote" : "beneficiaryAccessNote", {
            count: beneficiaryNames.length,
            names: joinNames(beneficiaryNames),
          })}
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
                    t={t}
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
                  t={t}
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
          {t("approvedSectionTitle")} ({approvedYesHeadcount})
        </h2>
        <ul className="flex flex-col gap-2">
          {approvedYes.map((row) => (
            <ApprovedParticipantRow
              key={row.id}
              row={row}
              isSelf={row.id === viewerRsvpId}
              isAdmin={isAdmin}
              isHost={isHost}
              hostProfileId={hostProfileId}
              isPending={isPending}
              isJourJ={isJourJ}
              t={t}
              onRoleChange={handleRoleChange}
              onRemove={setConfirmingRemoveId}
              onTransferHost={setConfirmingTransferId}
            />
          ))}
        </ul>
      </section>

      {approvedMaybe.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-foreground">
            {t("maybeSectionTitle")} ({approvedMaybeHeadcount})
          </h2>
          <ul className="flex flex-col gap-2">
            {approvedMaybe.map((row) => (
              <ApprovedParticipantRow
                key={row.id}
                row={row}
                isSelf={row.id === viewerRsvpId}
                isAdmin={isAdmin}
                isHost={isHost}
                hostProfileId={hostProfileId}
                isPending={isPending}
                isJourJ={isJourJ}
                t={t}
                onRoleChange={handleRoleChange}
                onRemove={setConfirmingRemoveId}
                onTransferHost={setConfirmingTransferId}
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

      <Modal open={confirmingTransferId !== null} onClose={() => setConfirmingTransferId(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, voir CancelEventButton */}
        <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
        <p className="text-center text-base text-foreground">{t("transferHostConfirmTitle")}</p>
        <div className="flex justify-center gap-3">
          <Button
            disabled={isPending}
            onClick={() => {
              const profileId = rows.find((r) => r.id === confirmingTransferId)?.profileId;
              if (profileId) handleTransferHost(profileId);
            }}
          >
            {t("transferHostConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingTransferId(null)}>
            {t("transferHostConfirmNo")}
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
  isHost,
  hostProfileId,
  isPending,
  isJourJ,
  t,
  onRoleChange,
  onRemove,
  onTransferHost,
}: {
  row: ParticipantRow;
  isSelf: boolean;
  isAdmin: boolean;
  isHost: boolean;
  hostProfileId: string;
  isPending: boolean;
  isJourJ: boolean;
  t: ReturnType<typeof useTranslations>;
  onRoleChange: (rsvpId: string, role: "guest" | "admin" | "beneficiary") => void;
  onRemove: (rsvpId: string) => void;
  onTransferHost: (rsvpId: string) => void;
}) {
  // "Organisateur" réservé à celui qui détient host_id ACTUELLEMENT (retour
  // Thomas : "dans les personnes, je suis marqué comme administrateur et pas
  // organisateur") -- le badge de l'Accueil (`hostBadge`) le distinguait déjà,
  // mais cette liste traitait l'hôte comme n'importe quel autre admin promu.
  const isRowHost = row.profileId === hostProfileId;
  return (
    <li className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
      <ParticipantIdentity
        row={row}
        companionsLabel={t("companionsCount", { count: row.companionsCount })}
        roleLabel={isAdmin ? roleLabel(row.role, isRowHost, t) : undefined}
        isJourJ={isJourJ}
        t={t}
      />
      {isAdmin && !isSelf && (
        <div className="flex flex-wrap items-center gap-2">
          {/* L'organisateur est intouchable, même pour un autre admin (retour
              Thomas : "je sais supprimer ou changer le rôle de
              l'organisateur, ce n'est pas logique") -- ni le sélecteur de
              rôle ni "Retirer" ne s'affichent sur sa ligne. La seule façon
              d'arrêter d'être organisateur reste le transfert explicite
              ci-dessous. Entre admins ordinaires (aucun des deux
              organisateur) : égalité, n'importe quel admin gère n'importe
              quel autre (même bloc, aucune restriction supplémentaire). */}
          {!isRowHost && (
            <>
              <select
                value={row.role}
                disabled={isPending}
                onChange={(e) =>
                  onRoleChange(row.id, e.target.value as "guest" | "admin" | "beneficiary")
                }
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
            </>
          )}
          {/* Seul l'hôte ACTUEL (jamais un simple admin promu) peut transférer
              l'organisation, et uniquement vers un autre admin déjà approuvé
              (retour Thomas : possibilité de quitter son propre événement une
              fois un autre admin en place). */}
          {isHost && row.role === "admin" && (
            <button
              type="button"
              onClick={() => onTransferHost(row.id)}
              className="text-sm font-semibold text-primary"
            >
              {t("transferHost")}
            </button>
          )}
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
  isJourJ = false,
  t,
}: {
  row: ParticipantRow;
  companionsLabel: string;
  roleLabel?: string;
  answerLabel?: string;
  // Mode Jour J (brief 4.11) : badges "Arrivé"/"Bien rentré" -- absent (donc
  // `false` par défaut) pour la file d'attente/les restricted, qui n'ont pas
  // ce concept avant d'être approuvés.
  isJourJ?: boolean;
  t: ReturnType<typeof useTranslations>;
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
        <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
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
        {/* Mode Jour J (brief 4.11) : "pratique pour savoir qui on attend
            avant de lancer le gâteau" -- badges affichés seulement le jour
            même, jamais avant/après. */}
        {isJourJ && (row.checkedInAt || row.arrivedHomeAt) && (
          <span className="flex gap-2 text-xs font-semibold text-accent-mint">
            {row.checkedInAt && <span>{t("checkedInBadge")}</span>}
            {row.arrivedHomeAt && <span>{t("arrivedHomeBadge")}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

function roleLabel(
  role: "guest" | "admin" | "beneficiary",
  isRowHost: boolean,
  t: ReturnType<typeof useTranslations>,
) {
  if (role === "admin") return isRowHost ? t("roleOrganizer") : t("roleAdmin");
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
