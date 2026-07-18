"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePushSubscription } from "@/lib/usePushSubscription";
import { updatePushCategoryPreference } from "@/app/[locale]/actions/push";
import type { PushCategoryInput } from "@/lib/validation/push";
import { notifySessionExpired } from "@/lib/session-expired";

const CATEGORIES: PushCategoryInput[] = ["invitations", "chat", "organisation", "jourj"];

// Réglage push, visible UNIQUEMENT en mode installé (`useIsStandalone`) --
// sur iPhone le Web Push ne fonctionne QUE si l'app est ajoutée à l'écran
// d'accueil (Safari ≥ 16.4), proposer le bouton dans un simple onglet
// induirait en erreur (voir landing page, section "Installe l'application").
// 4 catégories cochées par défaut, désactivables individuellement (retour
// Thomas : "doit être coché de base mais décochable si besoin") -- même
// pattern optimiste que `ReminderPreferenceToggle`, mais x4. Logique
// d'abonnement partagée avec `PushNotificationPrompt.tsx` via `usePushSubscription`.
export function PushNotificationSettings({
  initialPreferences,
}: {
  initialPreferences: Record<PushCategoryInput, boolean>;
}) {
  const t = useTranslations("ProfileCompletion");
  const { isStandalone, status, error: subscriptionError, subscribe, unsubscribe } = usePushSubscription();
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Session expirée pendant l'abonnement/désabonnement push (hook partagé
  // avec `PushNotificationPrompt.tsx`, même garde) : passe par le bandeau
  // global plutôt qu'un texte local, `subscriptionError` n'étant fiable
  // qu'une fois React re-rendu avec la nouvelle valeur (pas dans le closure
  // du gestionnaire de clic qui a déclenché l'appel).
  useEffect(() => {
    if (subscriptionError === "not_authenticated") notifySessionExpired();
  }, [subscriptionError]);

  async function handleSubscribe() {
    setError(null);
    const ok = await subscribe();
    if (!ok && subscriptionError !== "not_authenticated") {
      setError(subscriptionError === "permission_denied" ? t("pushErrorPermissionDenied") : t("errorUnknown"));
    }
  }

  function handleToggleCategory(category: PushCategoryInput, next: boolean) {
    setError(null);
    setPreferences((prev) => ({ ...prev, [category]: next }));
    startTransition(async () => {
      const result = await updatePushCategoryPreference(category, next);
      if (!result.ok) {
        setPreferences((prev) => ({ ...prev, [category]: !next }));
        if (result.error === "not_authenticated") {
          notifySessionExpired();
        } else {
          setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
        }
      }
    });
  }

  if (!isStandalone || status === "loading" || status === "unsupported") {
    return null;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3 border-t border-border pt-8 text-left">
      <p className="font-display text-lg font-bold text-foreground">{t("pushHeading")}</p>

      {status === "unsubscribed" ? (
        <button
          type="button"
          onClick={handleSubscribe}
          className="self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          {t("pushEnableButton")}
        </button>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={preferences[category]}
                  disabled={isPending}
                  onChange={(e) => handleToggleCategory(category, e.target.checked)}
                />
                {t(`pushCategory.${category}`)}
              </label>
            ))}
          </div>
          <button type="button" onClick={unsubscribe} className="self-start text-sm font-semibold text-accent-coral">
            {t("pushDisableButton")}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}
    </div>
  );
}
