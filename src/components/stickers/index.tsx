type StickerProps = { className?: string };

export function StickerConfetti({ className }: StickerProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Confettis">
      <path d="M8 20 L20 15 L16 27 Z" fill="#FACC15" />
      <rect x="34" y="8" width="14" height="14" rx="3" fill="#FB7185" transform="rotate(15 41 15)" />
      <circle cx="50" cy="32" r="6" fill="#34D399" />
      <path d="M12 44 L24 40 L21 52 Z" fill="#7C3AED" />
      <rect x="38" y="42" width="12" height="12" rx="3" fill="#FACC15" transform="rotate(-10 44 48)" />
    </svg>
  );
}

export function StickerGift({ className }: StickerProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Cadeau">
      <rect x="12" y="26" width="40" height="30" rx="6" fill="#7C3AED" />
      <rect x="12" y="26" width="40" height="10" fill="#6D28D9" />
      <rect x="28" y="10" width="8" height="46" fill="#FACC15" />
      <path d="M18 18 Q24 4 32 14 Q26 22 18 18 Z" fill="#FB7185" />
      <path d="M46 18 Q40 4 32 14 Q38 22 46 18 Z" fill="#34D399" />
    </svg>
  );
}

export function StickerCake({ className }: StickerProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Gateau">
      <rect x="10" y="34" width="44" height="20" rx="6" fill="#FB7185" />
      <rect x="10" y="34" width="44" height="8" fill="#ffffff" opacity="0.35" />
      <rect x="16" y="24" width="8" height="12" rx="2" fill="#FACC15" />
      <rect x="28" y="20" width="8" height="16" rx="2" fill="#FACC15" />
      <rect x="40" y="24" width="8" height="12" rx="2" fill="#FACC15" />
      <path d="M30 10 Q34 4 32 0 Q30 4 30 10 Z" fill="#34D399" />
      <circle cx="32" cy="9" r="3" fill="#FB7185" />
    </svg>
  );
}

export function StickerCocktail({ className }: StickerProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Cocktail">
      <path d="M14 12 H50 L34 34 V50 H30 V34 Z" fill="#7C3AED" />
      <path d="M18 16 H46 L34 30 Z" fill="#34D399" />
      <rect x="22" y="50" width="20" height="6" rx="3" fill="#6D28D9" />
      <path d="M40 20 Q46 14 50 18" stroke="#FACC15" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function StickerDiscoBall({ className }: StickerProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Boule disco">
      <circle cx="32" cy="32" r="22" fill="#C4B5FD" />
      <path d="M10 32 H54 M32 10 V54 M17 17 L47 47 M47 17 L17 47" stroke="#7C3AED" strokeWidth="2" opacity="0.5" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#2E1065" strokeWidth="2" opacity="0.15" />
      <path d="M20 6 L32 2 L44 6" stroke="#4C1D95" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
