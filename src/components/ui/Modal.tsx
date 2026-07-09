"use client";

import { type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  children,
  className = "w-full max-w-sm",
  fitContent = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Boîte ajustée à son contenu (ex. un picker d'émojis) plutôt qu'étirée
   * sur toute la largeur disponible : remplace tout `className`. */
  fitContent?: boolean;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={
          fitContent
            ? "flex w-fit max-w-[92vw] flex-col gap-4 rounded-konfeti bg-surface p-3 shadow-konfeti"
            : `flex flex-col gap-4 rounded-konfeti bg-surface p-6 shadow-konfeti ${className}`
        }
      >
        {children}
      </div>
    </div>
  );
}
