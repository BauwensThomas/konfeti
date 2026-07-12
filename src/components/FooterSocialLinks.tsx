import { getTranslations } from "next-intl/server";
import { IconInstagram, IconFacebook } from "@/components/icons/SocialIcons";

// Retour Thomas : "on parle de mon insta et facebook... dans le footer,
// avec les vrai couleur .. donc logo + nom" -- icône en couleurs de marque
// réelle + nom de la plateforme, ouverts dans un nouvel onglet (mènent hors
// de l'app).
export async function FooterSocialLinks() {
  const t = await getTranslations("Footer");

  return (
    <div className="flex items-center gap-5">
      <a
        href="https://www.instagram.com/konfeti_app"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-sm font-semibold text-foreground/70 hover:text-foreground"
      >
        <IconInstagram className="h-5 w-5" />
        {t("instagram")}
      </a>
      <a
        href="https://www.facebook.com/profile.php?id=61591900944905"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-sm font-semibold text-foreground/70 hover:text-foreground"
      >
        <IconFacebook className="h-5 w-5" />
        {t("facebook")}
      </a>
    </div>
  );
}
