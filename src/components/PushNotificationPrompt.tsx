"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePushSubscription } from "@/lib/usePushSubscription";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

const LAST_SHOWN_KEY = "konfeti-push-prompt-last-shown";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

// `useSyncExternalStore` plutôt qu'un `useEffect` + `setState` (lint
// `react-hooks/set-state-in-effect`) pour lire ce localStorage -- pattern
// officiellement recommandé pour synchroniser un état externe au rendu React,
// avec un snapshot serveur sûr (masqué par défaut, jamais de mismatch
// d'hydratation).
function subscribeNoop() {
  return () => {};
}
function getSnoozedSnapshot() {
  const lastShown = Number(localStorage.getItem(LAST_SHOWN_KEY) ?? 0);
  return Date.now() - lastShown < SNOOZE_MS;
}
function getSnoozedServerSnapshot() {
  return true;
}

// Popup mensuel (retour Thomas : "un petit popup pour ceux qui ont pas activé
// les push, 1x/mois, avec comme option activer les notifications et ça
// renvoie sur la page profil, s'ils disent non on est reparti pour un mois,
// c'est que pour ceux qui ont installé l'app sur leur tel") -- remplace
// l'ancienne bannière à rejet définitif : ici toute réponse (accepter ou
// refuser) relance simplement le compte à rebours d'un mois plutôt que de
// masquer le popup pour toujours. Contrairement à l'ancienne version, le
// bouton "Activer" ne demande pas la permission ici : il renvoie vers Mon
// profil (`PushNotificationSettings.tsx`), qui a déjà ce réglage.
export function PushNotificationPrompt() {
  const t = useTranslations("MyEvents");
  const { isStandalone, status, error: subscriptionError } = usePushSubscription();
  const snoozed = useSyncExternalStore(subscribeNoop, getSnoozedSnapshot, getSnoozedServerSnapshot);
  const [justSnoozed, setJustSnoozed] = useState(false);

  useEffect(() => {
    if (subscriptionError === "not_authenticated") notifySessionExpired();
  }, [subscriptionError]);

  function snooze() {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    setJustSnoozed(true);
  }

  const open = isStandalone && !snoozed && !justSnoozed && status === "unsubscribed";

  return (
    <Modal open={open} onClose={snooze} className="w-full max-w-sm">
      <p className="font-display text-lg font-bold text-foreground">{t("pushPromptTitle")}</p>
      <p className="text-sm text-foreground/70">{t("pushPromptBody")}</p>
      <div className="flex gap-3">
        <Link href="/profil" onClick={snooze}>
          <Button size="sm">{t("pushPromptEnable")}</Button>
        </Link>
        <button type="button" onClick={snooze} className="text-sm font-semibold text-foreground/60">
          {t("pushPromptDismiss")}
        </button>
      </div>
    </Modal>
  );
}
