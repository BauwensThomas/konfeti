"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { usePushSubscription } from "@/lib/usePushSubscription";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

const DISMISSED_KEY = "konfeti-push-prompt-dismissed";

// `useSyncExternalStore` plutôt qu'un `useEffect` + `setState` (lint
// `react-hooks/set-state-in-effect`) pour lire ce localStorage -- pattern
// officiellement recommandé pour synchroniser un état externe au rendu React,
// avec un snapshot serveur sûr (masqué par défaut, jamais de mismatch
// d'hydratation).
function subscribeNoop() {
  return () => {};
}
function getDismissedSnapshot() {
  return localStorage.getItem(DISMISSED_KEY) === "1";
}
function getDismissedServerSnapshot() {
  return true;
}

// Bannière proactive (retour Thomas : "il faut que toutes les notifications
// push soient activées par défaut" -- impossible techniquement, aucun site
// ne peut obtenir la permission navigateur sans un vrai clic utilisateur
// explicite. On met donc le bouton bien en vue au bon moment (juste après la
// complétion du profil, ici sur Mes événements -- première page revisitée
// systématiquement) plutôt que de le cacher dans Mon profil). Ne s'affiche
// que si jamais encore abonné, et disparaît définitivement après un rejet
// explicite (mémorisé en localStorage -- pas la peine de re-solliciter à
// chaque visite quelqu'un qui a déjà dit non).
export function PushNotificationPrompt() {
  const t = useTranslations("MyEvents");
  const { isStandalone, status, error: subscriptionError, subscribe } = usePushSubscription();
  const previouslyDismissed = useSyncExternalStore(subscribeNoop, getDismissedSnapshot, getDismissedServerSnapshot);
  const [justDismissed, setJustDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Voir PushNotificationSettings.tsx : `subscriptionError` n'est fiable
  // qu'une fois re-rendu, jamais dans le closure du clic qui a déclenché
  // `subscribe()`.
  useEffect(() => {
    if (subscriptionError === "not_authenticated") notifySessionExpired();
  }, [subscriptionError]);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setJustDismissed(true);
  }

  async function handleEnable() {
    setError(null);
    setIsSubscribing(true);
    const ok = await subscribe();
    setIsSubscribing(false);
    if (ok) {
      handleDismiss();
    } else if (subscriptionError !== "not_authenticated") {
      setError(subscriptionError === "permission_denied" ? t("pushPromptErrorPermissionDenied") : t("pushPromptErrorUnknown"));
    }
  }

  if (!isStandalone || previouslyDismissed || justDismissed || status !== "unsubscribed") {
    return null;
  }

  return (
    <Card className="flex w-full max-w-lg lg:max-w-2xl flex-col gap-2 text-left">
      <p className="font-display text-base font-bold text-foreground">{t("pushPromptTitle")}</p>
      <p className="text-sm text-foreground/70">{t("pushPromptBody")}</p>
      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button size="sm" onClick={handleEnable} disabled={isSubscribing}>
          {t("pushPromptEnable")}
        </Button>
        <button type="button" onClick={handleDismiss} className="text-sm font-semibold text-foreground/60">
          {t("pushPromptDismiss")}
        </button>
      </div>
    </Card>
  );
}
