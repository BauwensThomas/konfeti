"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useIsStandalone } from "@/lib/useIsStandalone";
import { subscribeToPush, unsubscribeFromPush, updatePushCategoryPreference } from "@/app/[locale]/actions/push";
import type { PushCategoryInput } from "@/lib/validation/push";

const CATEGORIES: PushCategoryInput[] = ["invitations", "chat", "organisation", "jourj"];

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

type Status = "loading" | "unsupported" | "unsubscribed" | "subscribed";

// Réglage push, visible UNIQUEMENT en mode installé (`useIsStandalone`) --
// sur iPhone le Web Push ne fonctionne QUE si l'app est ajoutée à l'écran
// d'accueil (Safari ≥ 16.4), proposer le bouton dans un simple onglet
// induirait en erreur (voir landing page, section "Installe l'application").
// 4 catégories cochées par défaut, désactivables individuellement (retour
// Thomas : "doit être coché de base mais décochable si besoin") -- même
// pattern optimiste que `ReminderPreferenceToggle`, mais x4.
export function PushNotificationSettings({
  initialPreferences,
}: {
  initialPreferences: Record<PushCategoryInput, boolean>;
}) {
  const t = useTranslations("ProfileCompletion");
  const isStandalone = useIsStandalone();
  const [status, setStatus] = useState<Status>("loading");
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isStandalone) return;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      setStatus(subscription ? "subscribed" : "unsubscribed");
    })();
  }, [isStandalone]);

  async function handleSubscribe() {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError(t("pushErrorPermissionDenied"));
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
      });
      const result = await subscribeToPush(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (!result.ok) {
        setError(t("errorUnknown"));
        return;
      }
      setStatus("subscribed");
    } catch {
      setError(t("errorUnknown"));
    }
  }

  async function handleUnsubscribe() {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch {
      setError(t("errorUnknown"));
    }
  }

  function handleToggleCategory(category: PushCategoryInput, next: boolean) {
    setError(null);
    setPreferences((prev) => ({ ...prev, [category]: next }));
    startTransition(async () => {
      const result = await updatePushCategoryPreference(category, next);
      if (!result.ok) {
        setPreferences((prev) => ({ ...prev, [category]: !next }));
        setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
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
          <button type="button" onClick={handleUnsubscribe} className="self-start text-sm font-semibold text-accent-coral">
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
