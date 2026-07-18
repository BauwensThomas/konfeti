"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { subscribeSessionExpired } from "@/lib/session-expired";

// Retour Thomas : un "Oups, quelque chose s'est mal passé" générique pour
// une session expirée en cours d'usage (chat, participants, cagnotte...) ne
// dit jamais à l'utilisateur quoi faire. Bandeau global unique plutôt qu'un
// message local par composant : ~40 Server Actions différentes peuvent
// renvoyer `not_authenticated`, toutes déclenchent désormais le même
// `notifySessionExpired()` (voir session-expired.ts) au lieu de chacune leur
// propre texte. `fixed` (pas `sticky`) : doit rester visible même profond
// dans une longue page (chat, liste de participants), z-50 pour passer
// au-dessus du header (`z-40`, sticky).
export function SessionExpiredBanner() {
  const t = useTranslations("SessionExpired");
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeSessionExpired(() => setVisible(true)), []);

  if (!visible) return null;

  return (
    <div
      role="alert"
      className="pt-safe fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-accent-coral px-4 py-3 text-center text-sm font-semibold text-white shadow-konfeti"
    >
      <p>{t("message")}</p>
      <Link
        href={`/connexion?next=${pathname}`}
        className="shrink-0 rounded-full bg-white px-4 py-1.5 text-accent-coral"
      >
        {t("reconnect")}
      </Link>
    </div>
  );
}
