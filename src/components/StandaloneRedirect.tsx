"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

// Retour Thomas : "mettre mon logo qui apparaît et qui change de page
// automatiquement, comme ça quand on regardera depuis l'app, on verra le
// logo puis on arrivera sur mes événements" -- ne redirige QUE si l'app a
// été lancée depuis l'icône ajoutée à l'écran d'accueil (`display-mode:
// standalone`, voir manifest.ts), jamais pour une visite navigateur normale
// de konfeti.belgacai.com, qui doit rester sur la page d'explication.
// `navigator.standalone` : propriété historique de Safari iOS, qui ne
// respecte pas toujours `display-mode` via `matchMedia`.
export function StandaloneRedirect() {
  const router = useRouter();

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      router.replace("/mes-evenements");
    }
  }, [router]);

  return null;
}
