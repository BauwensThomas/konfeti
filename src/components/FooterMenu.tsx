"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/Modal";

// Titre cliquable au-dessus du copyright (retour Thomas : "un titre, et
// quand on clique dessus ça ouvre un popup avec les différents liens des
// pages et un lien vers profil") -- regroupe les 4 pages légales (brief
// section 9) + le lien profil retiré du footer par le passé (voir
// Footer.tsx, "pas nécessaire" en accès direct) mais qui retrouve sa place
// ici, dans un menu secondaire plutôt qu'affiché en permanence.
export function FooterMenu() {
  const t = useTranslations("Footer");
  const [open, setOpen] = useState(false);

  const links: { href: "/confidentialite" | "/cgu" | "/cookies" | "/mentions-legales" | "/profil"; label: string }[] = [
    { href: "/confidentialite", label: t("linkPrivacy") },
    { href: "/cgu", label: t("linkTerms") },
    { href: "/cookies", label: t("linkCookies") },
    { href: "/mentions-legales", label: t("linkLegalNotice") },
    { href: "/profil", label: t("linkProfile") },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-primary"
      >
        {t("menuTitle")}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} fromBottom>
        <p className="font-display text-lg font-bold text-foreground">{t("menuTitle")}</p>
        <ul className="flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-konfeti px-2 py-2 text-sm font-semibold text-foreground hover:bg-primary/10"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
