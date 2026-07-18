"use client";

import { type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  open,
  onClose,
  children,
  className = "w-full max-w-sm",
  fitContent = false,
  fromBottom = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Boîte ajustée à son contenu (ex. un picker d'émojis) plutôt qu'étirée
   * sur toute la largeur disponible : remplace tout `className`. */
  fitContent?: boolean;
  /** Feuille ancrée en bas d'écran, glissant depuis le bas (retour Thomas,
   * menu du footer : "comme un menu qui se déroule mais inversé") plutôt
   * que centrée -- remplace tout `className`/`fitContent`. */
  fromBottom?: boolean;
}) {
  if (!open) return null;

  // Portail vers `document.body` (retour Thomas, bug réel repéré sur le
  // sélecteur de langue) : un `Modal` déclenché depuis un ancêtre avec
  // `backdrop-filter`/`filter`/`transform` (ici le header, `backdrop-blur-sm`)
  // se retrouvait positionné par rapport à CET ancêtre au lieu du vrai
  // viewport -- ces propriétés CSS créent un nouveau "containing block" pour
  // tout descendant `position: fixed`, un piège classique et non évident.
  // Rendre systématiquement dans `document.body` élimine toute la classe de
  // bug, peu importe où ce composant est utilisé à l'avenir.
  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex bg-black/50 ${fromBottom ? "items-end" : "items-center justify-center p-6"}`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={
          fromBottom
            ? "modal-slide-up flex max-h-[85vh] w-full flex-col gap-4 overflow-y-auto rounded-t-konfeti bg-surface p-6 shadow-konfeti pb-safe"
            : fitContent
              ? "flex max-h-[85vh] w-fit max-w-[92vw] flex-col gap-4 overflow-y-auto rounded-konfeti bg-surface p-3 shadow-konfeti"
              : `flex max-h-[85vh] flex-col gap-4 overflow-y-auto rounded-konfeti bg-surface p-6 shadow-konfeti ${className}`
        }
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
