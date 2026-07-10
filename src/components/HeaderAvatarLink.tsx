"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";

// Masqué sur la home ("/", page d'information publique avant lancement --
// retour Thomas : pas de sens d'exposer l'accès au profil là, même si le
// visiteur a déjà une session) et sur les pages du parcours de connexion/
// onboarding (`/connexion`, `/profil/completer`).
const HIDDEN_ON = ["/", "/connexion", "/profil/completer"];

export function HeaderAvatarLink({
  avatarUrl,
  label,
}: {
  avatarUrl: string | null;
  label: string;
}) {
  const pathname = usePathname();
  const hidden = HIDDEN_ON.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (hidden) return null;

  return (
    <Link
      href="/profil"
      aria-label={label}
      className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-primary/20"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar utilisateur (preset local ou photo signée), pas besoin de l'optimiseur next/image
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <AvatarPlaceholder className="h-full w-full rounded-full" compact />
      )}
    </Link>
  );
}
