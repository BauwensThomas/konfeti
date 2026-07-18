import type { MetadataRoute } from "next";

// Rend l'app installable (icône ajoutée à l'écran d'accueil, retour Thomas :
// "mettre mon logo qui apparaît et qui change de page automatiquement").
// `start_url`/`display: "standalone"` sont ce qui permet à `StandaloneRedirect.tsx`
// de distinguer un lancement depuis cette icône d'une simple visite navigateur
// (`window.matchMedia("(display-mode: standalone)")`).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Konfeti",
    short_name: "Konfeti",
    description: "Des invitations qui donnent envie de venir.",
    start_url: "/",
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
