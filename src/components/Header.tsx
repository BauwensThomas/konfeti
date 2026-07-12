import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserAvatarUrl } from "@/lib/avatars";
import { HeaderBackButton } from "@/components/HeaderBackButton";
import { HeaderAvatarLink } from "@/components/HeaderAvatarLink";
import { HeaderMyEventsLink } from "@/components/HeaderMyEventsLink";
import { HeaderLogo } from "@/components/HeaderLogo";
import { LocaleBadge } from "@/components/LocaleBadge";

// En-tête global (toutes les pages, voir layout.tsx), demande de Thomas
// ("voir la disposition du header") : jusqu'ici chaque page gérait sa propre
// zone du haut indépendamment. Porte la marge de sécurité du haut d'écran
// (`pt-safe`, encoche/caméra) puisqu'il est désormais le premier élément
// affiché, retirée du wrapper dans layout.tsx pour ne pas la doubler.
export async function Header() {
  const t = await getTranslations("Header");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const avatarUrl = user ? await resolveUserAvatarUrl(supabase, user.id) : null;

  return (
    <header className="pt-safe sticky top-0 z-40 border-b border-primary/10 bg-background/90 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-1">
          <HeaderBackButton label={t("back")} />
          <HeaderLogo label={t("home")} isLoggedIn={!!user} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LocaleBadge />
          <HeaderMyEventsLink />
          {user && <HeaderAvatarLink avatarUrl={avatarUrl} label={t("profile")} />}
        </div>
      </div>
    </header>
  );
}
