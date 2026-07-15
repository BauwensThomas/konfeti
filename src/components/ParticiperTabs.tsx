"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useTabNavigation } from "@/components/EventTabs";

type SubTab = "sondages" | "bring" | "cagnotte";

// Retour Thomas : "participer reprend la cagnotte, sondage, qui apporte
// quoi... ça va vite faire une longue liste" -- sous-onglets internes à
// l'onglet Participer plutôt que des onglets séparés au même niveau
// qu'Accueil/Chat/Personnes (une barre à 6-7 entrées casserait le rendu
// "vraie appli" visé par le TWA sur mobile). Même style de pilules que la
// barre d'onglets principale (`EventTabs.tsx`), un cran plus bas.
// `router.refresh()` (déjà déclenché par les abonnements Realtime dans
// `EventTabs.tsx` pour polls/bring_items/pot_contributions) recharge tout
// l'arbre de Server Components, donc les compteurs passés en props ici
// restent à jour tout seuls, sans abonnement Realtime propre à ce composant.
export function ParticiperTabs({
  sondages,
  bring,
  cagnotte,
  pendingPollsCount,
  pendingBringCount,
}: {
  sondages: ReactNode;
  bring: ReactNode;
  // `null` si la cagnotte est désactivée sur cet événement (retour Thomas :
  // "absente si cagnotte désactivé") -- l'onglet lui-même disparaît alors,
  // pas seulement son contenu.
  cagnotte: ReactNode | null;
  pendingPollsCount: number;
  pendingBringCount: number;
}) {
  const t = useTranslations("EventPage");
  const tabNavigation = useTabNavigation();
  const subTabs: SubTab[] = cagnotte ? ["sondages", "bring", "cagnotte"] : ["sondages", "bring"];
  const [active, setActive] = useState<SubTab>("sondages");

  // Retour Thomas : "quand je clique sur la bannière j'arrive sur sondage"
  // -- au montage seulement (jamais réévalué ensuite, voir le commentaire de
  // `TabNavigationContext`), applique le sous-onglet demandé depuis un autre
  // onglet (ex. la bannière Stripe de l'Accueil) puis l'efface aussitôt.
  // Différé via microtask (même remède que `ChatRoom.tsx` pour le même
  // avertissement react-hooks/set-state-in-effect), imperceptible pour
  // l'utilisateur (même tick de rendu).
  useEffect(() => {
    const requested = tabNavigation?.consumeParticiperSubTab();
    if (requested === "sondages" || requested === "bring" || requested === "cagnotte") {
      void Promise.resolve().then(() => setActive(requested));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const content = active === "sondages" ? sondages : active === "bring" ? bring : cagnotte;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-11 gap-1 rounded-full bg-surface p-1 shadow-konfeti">
        {subTabs.map((tab) => {
          // Retour Thomas : contrairement au chiffre agrégé désormais retiré
          // de l'onglet Participer lui-même (juste un point, voir
          // `EventTabs.tsx`), chaque sous-onglet garde son propre chiffre
          // précis -- la Cagnotte n'a pas de file de modération, donc jamais
          // de pastille sur cette pilule.
          const count = tab === "sondages" ? pendingPollsCount : tab === "bring" ? pendingBringCount : 0;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActive(tab)}
              // Retour Thomas : "quand je reçois une notif ça change la
              // taille de la bulle" -- "À apporter" passait à la ligne (le
              // texte le plus long des trois), ce qui grandissait TOUTE la
              // rangée dès qu'un badge s'ajoutait à côté. `whitespace-nowrap`
              // + hauteur fixe sur le conteneur (`h-11` ci-dessus) : la
              // pilule ne bouge plus jamais, peu importe le badge.
              className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-sm font-semibold transition-colors ${
                active === tab ? "bg-primary text-white" : "text-foreground/70"
              }`}
            >
              <span>{t(`participerTabs.${tab}`)}</span>
              {count > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent-coral px-1 text-xs font-bold text-white">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {content}
    </div>
  );
}
