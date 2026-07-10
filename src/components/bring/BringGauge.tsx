"use client";

import { useTranslations } from "next-intl";
import { StickerConfetti } from "@/components/stickers";

export type BringUnit = "piece" | "liter" | "gram" | "kilogram";

// Formatage compact : "3.5 L", "2 kg", "1 pièce"/"6 pièces" -- toujours avec
// une unité explicite (retour Thomas : un simple "1" sans rien à côté ne
// veut rien dire, même pour l'unité "pièce"). Un seul chiffre après la
// virgule, jamais "3.50".
export function formatQuantity(value: number, unit: BringUnit): string {
  const rounded = Math.round(value * 10) / 10;
  const number = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  if (unit === "liter") return `${number} L`;
  if (unit === "gram") return `${number} g`;
  if (unit === "kilogram") return `${number} kg`;
  return `${number} ${rounded <= 1 ? "pièce" : "pièces"}`;
}

/**
 * Jauge "quantité reçue / quantité demandée" pour un item "qui apporte quoi"
 * (brief 4.4) -- consulté le skill `dataviz` : un meter à une seule série
 * (pas un graphique catégoriel), donc pas de légende, une seule teinte de
 * marque (mint), piste neutre, et un LABEL TEXTE explicite à côté de la
 * barre (jamais la couleur seule pour porter l'info). Dépassement autorisé
 * et encouragé (brief : "8/6 s'affiche avec un sticker fêtard, un item
 * n'est jamais verrouillé") : la barre reste pleine à 100%, le sticker et le
 * chiffre réel (au-delà de la cible) portent l'information de dépassement.
 * Composant pur, réutilisé à l'identique dans la liste complète (Participer)
 * et la version compacte (Accueil).
 */
export function BringGauge({
  label,
  claimed,
  needed,
  unit,
}: {
  label: string;
  claimed: number;
  needed: number;
  unit: BringUnit;
}) {
  const t = useTranslations("Bring");
  const ratio = needed > 0 ? claimed / needed : 0;
  const fillPercent = Math.min(ratio, 1) * 100;
  const isOverflow = claimed > needed;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="flex items-center gap-1 text-xs font-semibold text-foreground/70">
          {isOverflow && <StickerConfetti className="h-4 w-4" />}
          {t("gaugeCount", { claimed: formatQuantity(claimed, unit), needed: formatQuantity(needed, unit) })}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full rounded-full bg-accent-mint transition-[width] duration-300"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      {isOverflow && <p className="text-xs font-semibold text-accent-mint">{t("gaugeOverflow")}</p>}
    </div>
  );
}
