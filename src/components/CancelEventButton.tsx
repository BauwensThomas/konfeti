"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cancelEvent } from "@/app/[locale]/actions/events";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

export function CancelEventButton({ eventId }: { eventId: string }) {
  const t = useTranslations("EventPage");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      {/* Icône seule (poubelle), pas de texte -- demande de Thomas ("juste
          une icone de poubelle"), maintenant que "Modifier"/"Partager" sont
          des bulles pleines à côté : `aria-label` obligatoire (icône seule). */}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={t("deleteEvent")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-strong text-white shadow-konfeti transition-[background-color,transform] duration-150 ease-out hover:brightness-95 active:scale-95"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
          <path
            d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.87 12.14A2 2 0 0 1 14.14 21H9.86a2 2 0 0 1-1.99-1.86L7 7m3 4v6m4-6v6"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Modal open={confirming} onClose={() => setConfirming(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, on évite le ré-encodage par l'optimiseur next/image (qui réintroduisait un fond noir) */}
        <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
        <p className="text-center text-base text-foreground">{t("deleteConfirm")}</p>
        <div className="flex justify-center gap-3">
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await cancelEvent(eventId);
                if (!result.ok && result.error === "not_authenticated") {
                  notifySessionExpired();
                }
              })
            }
          >
            {isPending ? t("deleting") : t("deleteConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            {t("deleteConfirmNo")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
