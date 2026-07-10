import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// Retour Thomas : proposer de se connecter pour ne rien perdre, affiché sur
// la page événement (Accueil) et "Mes événements" pour toute session
// anonyme -- le risque est réel (perte d'accès si le téléphone/les cookies
// sont perdus, voir DECISIONS.md § transfert d'organisation restreint aux
// vrais comptes, même mécanisme sous-jacent). Renvoie sur la section déjà
// construite dans /profil (`#lien-compte`), jamais un nouveau formulaire :
// les infos déjà remplies (nom, téléphone, avatar) sont conservées telles
// quelles (updateUser/linkIdentity préserve le même auth.uid()).
export async function LinkAccountBanner() {
  const t = await getTranslations("LinkAccountBanner");

  return (
    <div className="flex w-full max-w-lg lg:max-w-2xl items-center justify-between gap-3 rounded-konfeti bg-secondary/20 px-4 py-3">
      <p className="text-sm text-foreground">{t("text")}</p>
      <Link
        href="/profil#lien-compte"
        className="shrink-0 text-sm font-semibold text-primary underline-offset-2 hover:underline"
      >
        {t("cta")}
      </Link>
    </div>
  );
}
