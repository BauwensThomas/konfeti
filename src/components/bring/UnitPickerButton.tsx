"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { BringUnit } from "@/components/bring/BringGauge";

export type { BringUnit };

const UNITS: BringUnit[] = ["piece", "liter", "gram", "kilogram"];

/**
 * Bouton + popup de choix d'unité pour "qui apporte quoi" (brief 4.4).
 * Retours Thomas successifs : un menu (pas 4 boutons qui passaient à la
 * ligne sur mobile) -> un vrai popup ("il faut que ça ouvre un popup") ->
 * taille standard du `Modal`, pas `fitContent` (trop étroit, "plus large !
 * ça doit être adapté sur téléphone") -> "avant qu'il s'ouvre ça doit être
 * écrit choisir..." (jamais de valeur par défaut silencieuse).
 *
 * Extrait de `CreateEventWizard.tsx` pour être réutilisé tel quel par le
 * formulaire de proposition d'item côté Participer (`BringListClient.tsx`)
 * -- volontairement sans dépendance à next-intl : les libellés/placeholder
 * sont passés en props, chaque appelant reste libre de son propre namespace
 * de traduction.
 */
export function UnitPickerButton({
  value,
  onChange,
  unitLabels,
  placeholder,
  ariaLabel,
  className = "",
}: {
  value: BringUnit | "";
  onChange: (unit: BringUnit) => void;
  unitLabels: Record<BringUnit, string>;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={ariaLabel} className={className}>
        {value ? unitLabels[value] : placeholder}
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-1">
          {UNITS.map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => {
                onChange(unit);
                setOpen(false);
              }}
              className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
            >
              {unitLabels[unit]}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
