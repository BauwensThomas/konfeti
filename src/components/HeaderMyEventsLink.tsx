"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// Retour Thomas : sur la landing ("/"), l'avatar est masqué (page publique
// avant lancement, voir HeaderAvatarLink) -- un lien "Mes événements" prend
// sa place à droite du header. `/mes-evenements` gère déjà seul le cas "pas
// connecté" (redirection vers /connexion), ce lien fonctionne donc aussi
// bien pour un nouveau venu que pour quelqu'un qui revient.
export function HeaderMyEventsLink() {
  const pathname = usePathname();
  const t = useTranslations("Header");
  if (pathname !== "/") return null;

  return (
    <Link
      href="/mes-evenements"
      className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-konfeti transition-transform active:scale-95 hover:bg-primary-hover"
    >
      {t("myEvents")}
    </Link>
  );
}
