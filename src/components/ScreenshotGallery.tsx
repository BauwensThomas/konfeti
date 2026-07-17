"use client";

import { useState } from "react";
import Image from "next/image";

// Retour Thomas : "quand on clic sur les images que ça les agrandi" -- un
// lightbox simple (pas de librairie externe pour 3 images), fermeture par
// clic n'importe où sur l'overlay ou sur le bouton fermer.
export function ScreenshotGallery({
  items,
}: {
  items: { src: string; alt: string; titleKey: string; title: string; text: string }[];
}) {
  const [openSrc, setOpenSrc] = useState<{ src: string; alt: string } | null>(null);

  return (
    <>
      <div className="grid w-full max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
        {items.map(({ src, alt, titleKey, title, text }) => (
          <div key={titleKey} className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => setOpenSrc({ src, alt })}
              className="relative aspect-430/780 w-full max-w-56 cursor-pointer overflow-hidden rounded-konfeti border-4 border-white shadow-konfeti"
            >
              <Image src={src} alt={alt} fill sizes="224px" priority className="object-cover object-top" />
            </button>
            <p className="font-display text-lg font-bold text-foreground">{title}</p>
            <p className="max-w-56 text-sm text-foreground/70">{text}</p>
          </div>
        ))}
      </div>

      {openSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpenSrc(null)}
        >
          <button
            type="button"
            onClick={() => setOpenSrc(null)}
            aria-label="Fermer"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white"
          >
            ×
          </button>
          <div className="relative aspect-430/780 h-full max-h-[85vh] w-auto max-w-full overflow-hidden rounded-konfeti border-4 border-white shadow-konfeti">
            <Image src={openSrc.src} alt={openSrc.alt} fill sizes="100vw" className="object-cover object-top" />
          </div>
        </div>
      )}
    </>
  );
}
