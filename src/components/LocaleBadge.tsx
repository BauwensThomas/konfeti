"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Modal } from "@/components/ui/Modal";

// Pastille de langue dans le header (retour Thomas : "une boule un peu plus
// petite avec le drapeau français, quand on aura plusieurs langues on
// ouvrira une liste avec les autres langues") -- devenue un vrai
// sélecteur maintenant que `routing.locales` en contient plusieurs
// (`src/i18n/routing.ts`). Chaque langue s'affiche dans SA PROPRE langue
// (endonyme, ex. "Nederlands" pas "Néerlandais") : convention standard d'un
// sélecteur de langue, pour rester lisible même par quelqu'un qui ne lit pas
// la langue actuellement affichée. `<Link locale={...}>` (pas un
// `router.push` déclenché en JS) : reste un vrai lien, fonctionne même sans
// JavaScript, et next-intl reconstruit lui-même l'URL dans la nouvelle
// langue à partir du même `pathname`.
const LOCALE_NAMES: Record<string, string> = {
  fr: "Français",
  nl: "Nederlands",
  en: "English",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
};

function FlagFR() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect x="0" y="0" width="8" height="24" fill="#0055A4" />
      <rect x="8" y="0" width="8" height="24" fill="#FFFFFF" />
      <rect x="16" y="0" width="8" height="24" fill="#EF4135" />
    </svg>
  );
}

function FlagNL() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect x="0" y="0" width="24" height="8" fill="#AE1C28" />
      <rect x="0" y="8" width="24" height="8" fill="#FFFFFF" />
      <rect x="0" y="16" width="24" height="8" fill="#21468B" />
    </svg>
  );
}

function FlagEN() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect width="24" height="24" fill="#00247D" />
      <path d="M0 0L24 24M24 0L0 24" stroke="#FFFFFF" strokeWidth="5" />
      <path d="M0 0L24 24M24 0L0 24" stroke="#CF142B" strokeWidth="2" />
      <rect x="9" width="6" height="24" fill="#FFFFFF" />
      <rect y="9" width="24" height="6" fill="#FFFFFF" />
      <rect x="10.5" width="3" height="24" fill="#CF142B" />
      <rect y="10.5" width="24" height="3" fill="#CF142B" />
    </svg>
  );
}

function FlagES() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect x="0" y="0" width="24" height="6" fill="#AA151B" />
      <rect x="0" y="6" width="24" height="12" fill="#F1BF00" />
      <rect x="0" y="18" width="24" height="6" fill="#AA151B" />
    </svg>
  );
}

function FlagPT() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect x="0" y="0" width="10" height="24" fill="#006600" />
      <rect x="10" y="0" width="14" height="24" fill="#FF0000" />
    </svg>
  );
}

function FlagDE() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect x="0" y="0" width="24" height="8" fill="#000000" />
      <rect x="0" y="8" width="24" height="8" fill="#DD0000" />
      <rect x="0" y="16" width="24" height="8" fill="#FFCE00" />
    </svg>
  );
}

const LOCALE_FLAGS: Record<string, () => React.ReactNode> = {
  fr: FlagFR,
  nl: FlagNL,
  en: FlagEN,
  es: FlagES,
  pt: FlagPT,
  de: FlagDE,
};

export function LocaleBadge() {
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const CurrentFlag = LOCALE_FLAGS[locale] ?? FlagFR;
  const currentName = LOCALE_NAMES[locale] ?? "Français";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Langue actuelle : ${currentName}`}
        title={currentName}
        className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-primary/20"
      >
        <CurrentFlag />
      </button>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-1">
          {routing.locales.map((loc) => {
            const Flag = LOCALE_FLAGS[loc];
            return (
              <Link
                key={loc}
                href={pathname}
                locale={loc}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-konfeti px-4 py-3 text-left text-base ${
                  loc === locale ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-primary/10"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10">
                  <Flag />
                </span>
                {LOCALE_NAMES[loc]}
              </Link>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
