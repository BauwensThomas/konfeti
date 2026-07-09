import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { FooterProfileLink } from "@/components/FooterProfileLink";

// Pied de page global (toutes les pages, voir layout.tsx) : lien vers
// l'édition du profil (jamais affiché à un visiteur sans AUCUNE session —
// rien à modifier tant qu'il n'a rien soumis, ni sur les pages du parcours
// d'authentification/onboarding, voir `FooterProfileLink`) + copyright avec
// année calculée à chaque rendu (jamais figée en dur). Affiché aussi pour
// une session anonyme "code d'accès" : `/profil` ne requiert plus un vrai
// compte (voir proxy.ts), seule `/profil/completer` le fait encore.
export async function Footer() {
  const t = await getTranslations("Footer");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const year = new Date().getFullYear();

  return (
    <footer className="pb-safe flex flex-col items-center gap-2 px-6 pt-8 text-center">
      {user && <FooterProfileLink label={t("editProfile")} />}
      <p className="text-xs text-foreground/50">{t("copyright", { year })}</p>
    </footer>
  );
}
