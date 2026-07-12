"use client";

import { useSyncExternalStore } from "react";

function isStandaloneNow(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribe(callback: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getServerSnapshot() {
  return false;
}

// `useSyncExternalStore` (pas useEffect+setState) : lit une API navigateur
// externe sans déclencher de re-render en cascade au montage. Partagé entre
// HeaderLogo.tsx (logo non cliquable en mode installé) et
// PushNotificationSettings.tsx (le réglage n'a de sens que si l'app tourne
// en standalone -- sur iPhone le Web Push ne fonctionne QUE dans ce mode).
export function useIsStandalone(): boolean {
  return useSyncExternalStore(subscribe, isStandaloneNow, getServerSnapshot);
}
