import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveUserAvatarUrl } from "@/lib/avatars";
import { HeaderBackButton } from "@/components/HeaderBackButton";
import { HeaderAvatarLink } from "@/components/HeaderAvatarLink";

// En-tête global (toutes les pages, voir layout.tsx), demande de Thomas
// ("voir la disposition du header") : jusqu'ici chaque page gérait sa propre
// zone du haut indépendamment. Porte la marge de sécurité du haut d'écran
// (`pt-safe`, encoche/caméra) puisqu'il est désormais le premier élément
// affiché — retirée du wrapper dans layout.tsx pour ne pas la doubler.
export async function Header() {
  const t = await getTranslations("Header");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const avatarUrl = user ? await resolveUserAvatarUrl(supabase, user.id) : null;
  // Le logo ramène à "/mes-evenements" pour une session active (retour
  // Thomas : "ce n'est pas mieux de revenir sur les événements ?") -- même
  // raisonnement que la flèche retour, "/" reste une page publique/marketing
  // (pré-lancement), pas un point de chute utile pour quelqu'un de connecté.
  // Reste "/" pour un visiteur sans aucune session.
  const logoHref = user ? "/mes-evenements" : "/";

  return (
    <header className="pt-safe sticky top-0 z-40 border-b border-primary/10 bg-background/90 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-1">
          <HeaderBackButton label={t("back")} />
          <Link href={logoHref} aria-label={t("home")} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo local déjà optimisé, next/image réintroduit un fond noir sur ce type d'asset (voir DECISIONS.md) */}
            <img src="/logo-texte.webp" alt="Konfeti" className="h-7 w-auto object-contain sm:h-8" />
          </Link>
        </div>

        {user && <HeaderAvatarLink avatarUrl={avatarUrl} label={t("profile")} />}
      </div>
    </header>
  );
}
