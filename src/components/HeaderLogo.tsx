"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useIsStandalone } from "@/lib/useIsStandalone";

// Retour Thomas : dans l'app installée (PWA, icône ajoutée à l'écran
// d'accueil), il n'y a pas de bouton "retour" navigateur pour revenir depuis
// "/" (qui de toute façon redirige aussitôt vers Mes événements, voir
// StandaloneRedirect.tsx) : le logo n'y est donc PAS cliquable. Sur le web
// classique (navigateur normal), connecté, le logo remonte d'un cran dans la
// hiérarchie plutôt que de viser toujours la même page (retour Thomas :
// depuis un événement, il doit ramener à "Mes événements", pas à la
// landing ; depuis "Mes événements" lui-même, il n'y a plus rien "au-dessus"
// dans l'app, donc il ramène à la landing publique). Pas connecté : toujours
// la landing. `useSyncExternalStore` (pas useEffect+setState) : lit une API
// navigateur externe sans déclencher de re-render en cascade au montage.
export function HeaderLogo({ label, isLoggedIn }: { label: string; isLoggedIn: boolean }) {
  const isStandalone = useIsStandalone();
  const pathname = usePathname();

  const logoImg = (
    // eslint-disable-next-line @next/next/no-img-element -- logo local déjà optimisé, next/image réintroduit un fond noir sur ce type d'asset (voir DECISIONS.md)
    <img src="/logo-texte.webp" alt="Konfeti" className="h-7 w-auto object-contain sm:h-8" />
  );

  if (isStandalone) {
    return <div className="shrink-0">{logoImg}</div>;
  }

  const href = !isLoggedIn ? "/" : pathname === "/mes-evenements" ? "/" : "/mes-evenements";

  return (
    <Link href={href} aria-label={label} className="shrink-0">
      {logoImg}
    </Link>
  );
}
