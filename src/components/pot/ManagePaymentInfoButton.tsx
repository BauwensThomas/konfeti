"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createExpressDashboardLink } from "@/app/[locale]/actions/pot";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

// Retour Thomas : une fois onboardé, le porteur de la cagnotte doit pouvoir
// modifier ses propres infos bancaires -- redirige vers le vrai tableau de
// bord Stripe Express (pas de formulaire IBAN reconstruit côté Konfeti).
export function ManagePaymentInfoButton({ eventId }: { eventId: string }) {
  const t = useTranslations("Pot");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await createExpressDashboardLink(eventId);
      if (result.ok) {
        window.location.href = result.url;
      } else if (result.error === "not_authenticated") {
        notifySessionExpired();
      } else {
        setError(t(`error.${result.error}`));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={handleClick} disabled={isPending}>
        {isPending ? t("manageOpening") : t("manageButton")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}
    </div>
  );
}
