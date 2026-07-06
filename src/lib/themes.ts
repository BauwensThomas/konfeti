/**
 * Thèmes visuels de l'invitation (brief 4.1, écran 1 du wizard).
 * Indépendant de "l'occasion" (écran 2) : c'est un choix esthétique pur,
 * une galerie dans laquelle l'organisateur pioche l'ambiance de sa page.
 *
 * Le libellé affiché n'est pas ici (règle absolue 8, textes dans messages/fr.json) :
 * voir la clé `Themes.<key>` dans messages/fr.json.
 */
export type EventTheme = {
  key: string;
  gradientFrom: string;
  gradientTo: string;
  accent: string;
};

export const EVENT_THEMES: EventTheme[] = [
  {
    key: "confetti",
    gradientFrom: "#7C3AED",
    gradientTo: "#34D399",
    accent: "#FACC15",
  },
  {
    key: "disco",
    gradientFrom: "#2E1065",
    gradientTo: "#7C3AED",
    accent: "#FB7185",
  },
  {
    key: "tropical",
    gradientFrom: "#34D399",
    gradientTo: "#FACC15",
    accent: "#7C3AED",
  },
  {
    key: "pastel",
    gradientFrom: "#C4B5FD",
    gradientTo: "#FBCFE8",
    accent: "#FB7185",
  },
  {
    key: "neon",
    gradientFrom: "#1E1033",
    gradientTo: "#7C3AED",
    accent: "#34D399",
  },
  {
    key: "gold",
    gradientFrom: "#5B21B6",
    gradientTo: "#FACC15",
    accent: "#FFF7F5",
  },
  {
    key: "summer",
    gradientFrom: "#FB7185",
    gradientTo: "#FACC15",
    accent: "#34D399",
  },
  {
    key: "winter",
    gradientFrom: "#4C1D95",
    gradientTo: "#34D399",
    accent: "#FACC15",
  },
  {
    key: "generic",
    gradientFrom: "#7C3AED",
    gradientTo: "#FB7185",
    accent: "#FACC15",
  },
];
