"use client";

import { useEffect, useState } from "react";
import { useIsStandalone } from "@/lib/useIsStandalone";
import { subscribeToPush, unsubscribeFromPush } from "@/app/[locale]/actions/push";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export type PushSubscriptionStatus = "loading" | "unsupported" | "unsubscribed" | "subscribed";

// Logique d'abonnement push partagée entre `PushNotificationSettings.tsx`
// (réglages, dans Mon profil) et `PushNotificationPrompt.tsx` (bannière
// proactive, retour Thomas : "il faut que toutes les notifications push
// soient activées par défaut" -- impossible techniquement (aucun site ne
// peut obtenir la permission navigateur sans un vrai clic utilisateur),
// donc on met plutôt le bouton d'activation bien en vue au bon moment
// plutôt que caché dans les réglages). N'a de sens qu'en mode installé
// (`isStandalone`, voir commentaire de `PushNotificationSettings.tsx`).
export function usePushSubscription() {
  const isStandalone = useIsStandalone();
  const [status, setStatus] = useState<PushSubscriptionStatus>("loading");
  const [error, setError] = useState<string | null>(null);

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

  async function subscribe(): Promise<boolean> {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("permission_denied");
        return false;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
      });
      const result = await subscribeToPush(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      if (!result.ok) {
        setError("unknown");
        return false;
      }
      setStatus("subscribed");
      return true;
    } catch {
      setError("unknown");
      return false;
    }
  }

  async function unsubscribe(): Promise<void> {
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
      setError("unknown");
    }
  }

  return { isStandalone, status, error, subscribe, unsubscribe };
}
