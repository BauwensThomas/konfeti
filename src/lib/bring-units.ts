export type BringUnit = "piece" | "liter" | "gram" | "kilogram";

// Formatage compact : "3.5 L", "2 kg", "1 pièce"/"6 pièces" -- toujours avec
// une unité explicite (retour Thomas : un simple "1" sans rien à côté ne
// veut rien dire, même pour l'unité "pièce"). Un seul chiffre après la
// virgule, jamais "3.50". Extrait de `BringGauge.tsx` (composant client) pour
// être réutilisable depuis du code non-React (export PDF, voir route.ts).
export function formatQuantity(value: number, unit: BringUnit): string {
  const rounded = Math.round(value * 10) / 10;
  const number = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  if (unit === "liter") return `${number} L`;
  if (unit === "gram") return `${number} g`;
  if (unit === "kilogram") return `${number} kg`;
  return `${number} ${rounded <= 1 ? "pièce" : "pièces"}`;
}
