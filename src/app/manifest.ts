import type { MetadataRoute } from "next";

// Rend l'app installable (icône ajoutée à l'écran d'accueil, retour Thomas :
// "mettre mon logo qui apparaît et qui change de page automatiquement").
// `start_url` pointe directement sur "Mes événements" (retour Thomas :
// "je veux que ça ouvre sur .../mes-evenements direct, et si pas connecté sur
// la page de connexion") -- pas besoin de passer par la home d'abord : la
// route n'est pas préfixée par la langue ici (un seul manifest, pas un par
// langue), le proxy next-intl (`src/proxy.ts`) la redirige lui-même vers la
// bonne locale (`/fr/mes-evenements` aujourd'hui, une autre langue plus tard
// automatiquement), puis `mes-evenements/page.tsx` redirige déjà vers
// `/connexion?next=/mes-evenements` si personne n'est connectée -- les deux
// cas demandés sont donc déjà couverts sans code applicatif supplémentaire.
// `display: "standalone"` reste ce qui permet à `StandaloneRedirect.tsx` de
// distinguer un lancement depuis cette icône d'une simple visite navigateur
// (`window.matchMedia("(display-mode: standalone)")`) -- gardé en filet de
// sécurité si jamais l'app standalone atterrit un jour sur la home malgré tout.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Konfeti",
    short_name: "Konfeti",
    description: "Des invitations qui donnent envie de venir.",
    start_url: "/mes-evenements",
    display: "standalone",
    background_color: "#fff7f5",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
