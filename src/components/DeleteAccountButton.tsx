"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteAccount } from "@/app/[locale]/actions/auth";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// Suppression de compte en libre-service (retour Thomas : "on doit pouvoir
// supprimer son compte, et effacer toutes les données") -- même pattern de
// confirmation que `CancelEventButton.tsx`. `deleteAccount` nettoie/anonymise
// tout (chat, sondages, qui apporte quoi, accompagnants) avant de supprimer
// réellement le compte ; `router.refresh()` après un succès n'aurait aucun
// sens (le compte n'existe plus) -- redirection pleine page vers l'accueil.
export function DeleteAccountButton() {
  const t = useTranslations("ProfileCompletion");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount();
      if (result.ok) {
        window.location.href = "/";
      } else {
        setError(
          result.error === "still_hosting"
            ? t("deleteAccountErrorHosting")
            : result.error === "rate_limited"
              ? t("errorRateLimited")
              : t("deleteAccountErrorUnknown"),
        );
      }
    });
  }

  return (
    <div id="supprimer-compte" className="flex w-full max-w-sm scroll-mt-20 flex-col gap-3 border-t border-border pt-8">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold text-accent-coral">{t("deleteAccountHeading")}</h2>
        <p className="text-sm text-foreground/80">{t("deleteAccountSubheading")}</p>
      </div>
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {t("deleteAccountButton")}
      </Button>

      <Modal open={confirming} onClose={() => setConfirming(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, voir CancelEventButton */}
        <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
        <p className="text-center text-base text-foreground">{t("deleteAccountConfirmTitle")}</p>
        {error && (
          <p role="alert" className="text-center text-sm text-accent-coral">
            {error}
          </p>
        )}
        <div className="flex justify-center gap-3">
          <Button variant="danger" disabled={isPending} onClick={handleConfirm}>
            {isPending ? t("deleteAccountDeleting") : t("deleteAccountConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            {t("deleteAccountConfirmNo")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
