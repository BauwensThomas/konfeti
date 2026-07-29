import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { FooterMenu } from "@/components/FooterMenu";
import { FooterSocialLinks } from "@/components/FooterSocialLinks";
import { version } from "../../package.json";

// Pied de page global (toutes les pages, voir layout.tsx) : copyright avec
// année calculée à chaque rendu (jamais figée en dur). Le lien "Modifier mon
// profil" qui vivait ici en accès direct a été retiré par le passé (retour
// Thomas : "pas nécessaire") -- il revient désormais dans le popup
// `FooterMenu`, avec les pages légales (brief section 9), plutôt qu'affiché
// en permanence.
export async function Footer() {
  const t = await getTranslations("Footer");
  const year = new Date().getFullYear();

  // Retour Thomas : "on a mis aucun bouton se déconnecter, ce n'est pas
  // grave ?" -- vrai manque, la seule façon de se déconnecter avant ce
  // correctif passait par "Gérer les cookies" (effet de bord d'un bouton
  // RGPD, jamais pensé comme une vraie déconnexion). "Se déconnecter" n'a de
  // sens qu'avec une session active, jamais affiché à un visiteur non connecté.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <footer className="pb-safe flex flex-col items-center gap-3 px-6 pt-8 text-center">
      <FooterMenu isLoggedIn={!!user} />
      <FooterSocialLinks />
      <p className="text-xs text-primary">{t("copyright", { year })}</p>
      {/* Retour Thomas : "il faut rajouter sur la version mobile la version
          x.xx" -- utile pour savoir quelle version est installée sur un
          téléphone (PWA), notamment en support/débogage. Lue directement
          depuis `package.json`, jamais dupliquée à la main. */}
      <p className="text-[10px] text-primary/50">v{version}</p>
    </footer>
  );
}
