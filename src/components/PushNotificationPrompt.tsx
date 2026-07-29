"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePushSubscription } from "@/lib/usePushSubscription";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { notifySessionExpired } from "@/lib/session-expired";

const LAST_SHOWN_KEY = "konfeti-push-prompt-last-shown";
const FIRST_LAUNCH_KEY = "konfeti-push-first-launch-attempted";
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
function getFirstLaunchAttemptedSnapshot() {
  return localStorage.getItem(FIRST_LAUNCH_KEY) === "1";
}
function getFirstLaunchAttemptedServerSnapshot() {
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
//
// Retour Thomas ensuite ("quand on telecharge l'app depuis playstore, toutes
// les notifs doivent etre activée") : à la toute première ouverture de l'app
// installée (Play Store/TWA ou PWA), on déclenche directement la vraie
// popup système Android/navigateur -- plus besoin d'aller dans Mon profil et
// cliquer. Techniquement impossible d'activer les notifications SANS ce
// geste (Android/Chrome exigent un vrai clic utilisateur sur leur propre
// popup, aucun moyen de contourner ça), donc "toutes activées d'office"
// devient concrètement "la demande apparaît toute seule dès l'ouverture,
// un seul tap suffit". Un seul essai automatique, jamais répété (marqueur
// `localStorage`) : si la personne refuse ce premier essai, elle retombe sur
// le popup mensuel classique comme n'importe qui d'autre, jamais spammée de
// popups système à chaque ouverture.
export function PushNotificationPrompt() {
  const t = useTranslations("MyEvents");
  const { isStandalone, status, error: subscriptionError, subscribe } = usePushSubscription();
  const snoozed = useSyncExternalStore(subscribeNoop, getSnoozedSnapshot, getSnoozedServerSnapshot);
  const firstLaunchAttempted = useSyncExternalStore(
    subscribeNoop,
    getFirstLaunchAttemptedSnapshot,
    getFirstLaunchAttemptedServerSnapshot,
  );
  const [justSnoozed, setJustSnoozed] = useState(false);
  const autoAttemptStarted = useRef(false);

  useEffect(() => {
    if (subscriptionError === "not_authenticated") notifySessionExpired();
  }, [subscriptionError]);

  useEffect(() => {
    if (!isStandalone || firstLaunchAttempted || status !== "unsubscribed" || autoAttemptStarted.current) return;
    autoAttemptStarted.current = true;
    localStorage.setItem(FIRST_LAUNCH_KEY, "1");
    subscribe();
  }, [isStandalone, firstLaunchAttempted, status, subscribe]);

  function snooze() {
    localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
    setJustSnoozed(true);
  }

  const open = isStandalone && firstLaunchAttempted && !snoozed && !justSnoozed && status === "unsubscribed";

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
