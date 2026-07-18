"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { startPotOnboarding } from "@/app/[locale]/actions/pot";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

// Bouton "Configurer les paiements" (brief 4.5 : onboarding Stripe Connect
// Express) -- redirige vers Stripe dès la réponse de l'action serveur,
// jamais de formulaire construit à la main.
export function StartOnboardingButton({ eventId }: { eventId: string }) {
  const t = useTranslations("Pot");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await startPotOnboarding(eventId);
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
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? t("onboardingStarting") : t("onboardingButton")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}
    </div>
  );
}
