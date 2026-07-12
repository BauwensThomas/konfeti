type IconProps = { className?: string };

// Couleurs de marque réelles (retour Thomas : "avec les vrai couleur"), pas
// un simple `currentColor` monochrome comme le reste des icônes maison du
// projet -- ces deux-là doivent rester reconnaissables au premier coup d'œil.
export function IconInstagram({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="instagram-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FEDA75" />
          <stop offset="30%" stopColor="#FA7E1E" />
          <stop offset="55%" stopColor="#D62976" />
          <stop offset="80%" stopColor="#962FBF" />
          <stop offset="100%" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="url(#instagram-gradient)" />
      <rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.6" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="#fff" />
    </svg>
  );
}

export function IconFacebook({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1877F2" />
      <path
        d="M15.4 12.5h-2.1v7h-2.9v-7H8.9V10h1.5V8.6c0-1.5.9-2.7 2.9-2.7h1.9v2.5h-1.2c-.4 0-.7.3-.7.7V10h1.9l-.3 2.5Z"
        fill="#fff"
      />
    </svg>
  );
}

// Triangle "Google Play" aux 4 couleurs de marque (vert/jaune/rouge/bleu).
export function IconGooglePlay({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M4 3.6v16.8c0 .5.27.9.66 1.1L13.4 12 4.66 2.5c-.4.2-.66.6-.66 1.1Z" fill="#00D2FF" />
      <path d="M13.4 12 4.66 2.5c.1-.05.2-.08.32-.1.3-.05.63.02.9.2l8.6 5-1.08 4.4Z" fill="#00E676" />
      <path d="M13.4 12l1.08 4.4-8.6 5c-.27.18-.6.25-.9.2a1.1 1.1 0 0 1-.32-.1L13.4 12Z" fill="#FF3A44" />
      <path d="M17.3 9.9l2.98 1.73a1.1 1.1 0 0 1 0 1.9l-2.98 1.75L13.4 12l3.9-2.1Z" fill="#FFC900" />
    </svg>
  );
}
