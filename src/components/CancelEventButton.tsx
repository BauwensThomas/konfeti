"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cancelEvent } from "@/app/[locale]/actions/events";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export function CancelEventButton({ eventId }: { eventId: string }) {
  const t = useTranslations("EventPage");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-semibold text-accent-coral"
      >
        {t("deleteEvent")}
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
                await cancelEvent(eventId);
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
