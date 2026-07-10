export const CONFETTI_COLORS = ["#7C3AED", "#FACC15", "#FB7185", "#34D399", "#C4B5FD"];
export const CONFETTI_SHAPES = ["circle", "square", "triangle", "diamond"] as const;

export type ConfettiShape = (typeof CONFETTI_SHAPES)[number];

export type ConfettiPiece = {
  id: number;
  shape: ConfettiShape;
  color: string;
  top: number;
  left: number;
  size: number;
  rotate: number;
};

// Factorisé depuis `ConfettiBackground.tsx` (fond de page statique) pour
// être réutilisé par `ChatConfettiBackground.tsx` (fond du chat, animé) sans
// dupliquer la génération/le rendu des formes.
export function randomConfettiPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    shape: CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)],
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: 10 + Math.random() * 16,
    rotate: Math.random() * 360,
  }));
}

export function confettiBorderRadius(shape: ConfettiShape): string {
  if (shape === "circle") return "9999px";
  if (shape === "square") return "3px";
  return "0";
}

export function confettiClipPath(shape: ConfettiShape): string | undefined {
  if (shape === "triangle") return "polygon(50% 0%, 0% 100%, 100% 100%)";
  if (shape === "diamond") return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
  return undefined;
}

// Bug réel signalé par Thomas ("au plus on écrit, au plus les confettis du
// chat s'écartent les uns des autres") : `randomConfettiPieces` positionne
// chaque pièce en POURCENTAGE d'un conteneur dont la hauteur grandit avec les
// messages (voir ChatConfettiBackground) -- un pourcentage fixe sur une
// hauteur qui change fait mécaniquement s'écarter les mêmes pièces au lieu
// d'en révéler de nouvelles. Corrigé pour le chat via un MOTIF RÉPÉTÉ en
// pixels fixes (image CSS `background-repeat`) plutôt que des éléments
// positionnés individuellement : la densité reste constante quelle que soit
// la hauteur réelle, et de nouvelles répétitions du motif apparaissent
// naturellement (sans JS, sans mesure de hauteur) au fur et à mesure que le
// conteneur grandit -- "tout le chat" est aussi rempli même vide, une image
// de fond couvre toujours 100% de son conteneur quelle que soit sa taille.
function confettiShapeSvg(shape: ConfettiShape, color: string, size: number): string {
  const half = size / 2;
  if (shape === "circle") return `<circle cx="0" cy="0" r="${half}" fill="${color}" />`;
  if (shape === "square") return `<rect x="${-half}" y="${-half}" width="${size}" height="${size}" rx="3" fill="${color}" />`;
  if (shape === "triangle") {
    return `<polygon points="0,${-half} ${half},${half} ${-half},${half}" fill="${color}" />`;
  }
  return `<polygon points="0,${-half} ${half},0 0,${half} ${-half},0" fill="${color}" />`;
}

/**
 * Construit un motif de confettis carré (`tileSize`×`tileSize`), encodé en
 * data URI SVG, destiné à être répété via `background-repeat: repeat` sur un
 * fond dont la hauteur varie (contrairement à `randomConfettiPieces`, pensé
 * pour un conteneur de taille fixe comme la page).
 */
export function buildConfettiTileDataUri(tileSize: number, pieceCount: number): string {
  const shapes = Array.from({ length: pieceCount }, () => {
    const shape = CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)];
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const size = 10 + Math.random() * 16;
    const x = Math.random() * tileSize;
    const y = Math.random() * tileSize;
    const rotate = Math.random() * 360;
    return `<g transform="translate(${x} ${y}) rotate(${rotate})">${confettiShapeSvg(shape, color, size)}</g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}" viewBox="0 0 ${tileSize} ${tileSize}">${shapes}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
