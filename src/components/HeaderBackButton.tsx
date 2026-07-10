"use client";

import { usePathname, useRouter } from "@/i18n/navigation";

// Masqué sur la home ("/", rien "avant") et sur l'onboarding obligatoire
// (`/profil/completer`, parcours forcé sans échappatoire). Partout ailleurs :
// va toujours vers `/mes-evenements`, jamais un `router.back()` (retour
// Thomas : "c'est mieux de revenir sur les événements non ?").
//
// Un `router.back()` avec repli conditionnel a été essayé puis abandonné :
// dans une app où l'on navigue souvent d'un événement à l'autre dans le même
// onglet (ex. un invité qui rejoint plusieurs événements), le "vrai"
// historique de navigateur ne pointe pas forcément vers un endroit utile
// (ça peut renvoyer vers un événement précédent sans rapport, voire ne rien
// faire) — repéré en écrivant le test e2e correspondant. Une destination
// fixe et prévisible est plus simple et plus fiable ici.
const HIDDEN_ON = ["/", "/profil/completer"];

export function HeaderBackButton({ label }: { label: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const hidden = HIDDEN_ON.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/mes-evenements")}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
