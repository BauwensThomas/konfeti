"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useIsStandalone } from "@/lib/useIsStandalone";

// Retour Thomas : "dans l'app mobile, qui est telecharger depuis le
// playstore, on ne doit pas avoir comment installer l'application" -- une
// fois l'app déjà installée (Play Store/TWA ou PWA "Ajouter à l'écran
// d'accueil", les deux se rapportent en mode standalone via
// `useIsStandalone`), ce lien n'a plus de sens : utile seulement à qui
// navigue encore dans un onglet de navigateur classique, pas encore installé.
export function InstallGuideLink() {
  const t = useTranslations("MyEvents");
  const isStandalone = useIsStandalone();

  if (isStandalone) return null;

  return (
    <Link
      href="/comment-installer"
      className="w-full max-w-lg text-sm font-semibold text-primary underline-offset-2 hover:underline lg:max-w-2xl"
    >
      {t("installGuideLink")}
    </Link>
  );
}
