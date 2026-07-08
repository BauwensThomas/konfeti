"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  approveRsvp,
  removeParticipant,
  setParticipantRole,
} from "@/app/[locale]/actions/participants";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";

export type ParticipantRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  status: "pending" | "approved" | "restricted";
  role: "guest" | "admin" | "beneficiary";
  answer: "yes" | "maybe" | "no";
  companionsCount: number;
};

export function ParticipantsList({
  shortCode,
  viewerRsvpId,
  isAdmin,
  rows,
}: {
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  rows: ParticipantRow[];
}) {
  const t = useTranslations("Participants");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  const pending = rows.filter((r) => r.status === "pending" || r.status === "restricted");
  const approved = rows.filter((r) => r.status === "approved");

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
    startTransition(async () => {
      await setParticipantRole(rsvpId, shortCode, role);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
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
                  <ParticipantIdentity row={row} companionsLabel={t("companionsCount", { count: row.companionsCount })} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={isPending}
                      onClick={() => handleApprove(row.id, "guest")}
                    >
                      {t("approveAsGuest")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={isPending}
                      onClick={() => handleApprove(row.id, "beneficiary")}
                    >
                      {t("approveAsBeneficiary")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemoveId(row.id)}
                      className="text-sm font-semibold text-accent-coral"
                    >
                      {t("reject")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">
          {t("approvedSectionTitle")}
        </h2>
        <ul className="flex flex-col gap-2">
          {approved.map((row) => {
            const isSelf = row.id === viewerRsvpId;
            return (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-konfeti border border-border p-3"
              >
                <ParticipantIdentity
                  row={row}
                  companionsLabel={t("companionsCount", { count: row.companionsCount })}
                  roleLabel={isAdmin && !isSelf ? roleLabel(row.role, t) : undefined}
                />
                {isAdmin && !isSelf && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={row.role}
                      disabled={isPending}
                      onChange={(e) =>
                        handleRoleChange(row.id, e.target.value as "guest" | "admin" | "beneficiary")
                      }
                      className="rounded-konfeti border border-border bg-surface px-2 py-1 text-sm text-foreground"
                    >
                      <option value="guest">{t("roleGuest")}</option>
                      <option value="admin">{t("roleAdmin")}</option>
                      <option value="beneficiary">{t("roleBeneficiary")}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemoveId(row.id)}
                      className="text-sm font-semibold text-accent-coral"
                    >
                      {t("remove")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

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
    </div>
  );
}

function ParticipantIdentity({
  row,
  companionsLabel,
  roleLabel,
}: {
  row: ParticipantRow;
  companionsLabel: string;
  roleLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
        {row.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar utilisateur (preset local ou photo signée), pas besoin de l'optimiseur next/image
          <img src={row.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <AvatarPlaceholder className="h-full w-full rounded-full" />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">
          {row.firstName} {row.lastName}
          {row.companionsCount > 0 ? ` ${companionsLabel}` : ""}
        </span>
        {roleLabel && <span className="text-xs text-foreground/60">{roleLabel}</span>}
      </div>
    </div>
  );
}

function roleLabel(role: "guest" | "admin" | "beneficiary", t: ReturnType<typeof useTranslations>) {
  if (role === "admin") return t("roleAdmin");
  if (role === "beneficiary") return t("roleBeneficiary");
  return t("roleGuest");
}
