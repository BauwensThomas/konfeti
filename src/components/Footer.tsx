import { getTranslations } from "next-intl/server";

// Pied de page global (toutes les pages, voir layout.tsx) : copyright avec
// année calculée à chaque rendu (jamais figée en dur). Le lien "Modifier mon
// profil" qui vivait ici a été retiré (retour Thomas : "pas nécessaire") --
// l'avatar du header (`HeaderAvatarLink`) couvre déjà cet accès.
export async function Footer() {
  const t = await getTranslations("Footer");
  const year = new Date().getFullYear();

  return (
    <footer className="pb-safe flex flex-col items-center gap-2 px-6 pt-8 text-center">
      <p className="text-xs text-primary">{t("copyright", { year })}</p>
    </footer>
  );
}
