"use client";

import { Link, usePathname } from "@/i18n/navigation";

// Masqué sur les pages du parcours d'authentification/onboarding (retour
// Thomas : vu sur /connexion après une redirection, "est-ce correct ?" — non,
// un lien "Modifier mon profil" n'a pas de sens tant qu'on est en train de se
// connecter ou de compléter son profil pour la première fois). Composant
// client à part (plutôt que dans Footer.tsx, Server Component) : seul
// `usePathname` a besoin du chemin courant, pas la vérification de session.
const HIDDEN_ON = ["/connexion", "/profil/completer"];

export function FooterProfileLink({ label }: { label: string }) {
  const pathname = usePathname();
  if (HIDDEN_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  return (
    <Link
      href="/profil"
      className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );
}
