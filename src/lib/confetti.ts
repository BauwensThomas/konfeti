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
