import { getTranslations } from "next-intl/server";
import { FooterMenu } from "@/components/FooterMenu";
import { FooterSocialLinks } from "@/components/FooterSocialLinks";

// Pied de page global (toutes les pages, voir layout.tsx) : copyright avec
// année calculée à chaque rendu (jamais figée en dur). Le lien "Modifier mon
// profil" qui vivait ici en accès direct a été retiré par le passé (retour
// Thomas : "pas nécessaire") -- il revient désormais dans le popup
// `FooterMenu`, avec les pages légales (brief section 9), plutôt qu'affiché
// en permanence.
export async function Footer() {
  const t = await getTranslations("Footer");
  const year = new Date().getFullYear();

  return (
    <footer className="pb-safe flex flex-col items-center gap-3 px-6 pt-8 text-center">
      <FooterMenu />
      <FooterSocialLinks />
      <p className="text-xs text-primary">{t("copyright", { year })}</p>
    </footer>
  );
}
