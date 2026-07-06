const WORDS = [
  "FIESTA",
  "PARTY",
  "CONFETTI",
  "SOIREE",
  "FETE",
  "DISCO",
  "GALA",
  "BOOM",
];

/** Génère un code court et fun (ex. "FIESTA-4291"), brief 1.2. */
export function generateShortCode(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${number}`;
}

// Mots distincts de WORDS pour qu'un code d'invité (rsvps.guest_code) ne soit
// jamais visuellement confondu avec le code court d'un événement.
const GUEST_WORDS = [
  "INVITE",
  "GUEST",
  "COPAIN",
  "VOISIN",
  "AMI",
  "TEAM",
  "CREW",
  "GANG",
];

/** Génère le code personnel de récupération cross-device (brief 1.2). */
export function generateGuestCode(): string {
  const word = GUEST_WORDS[Math.floor(Math.random() * GUEST_WORDS.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${number}`;
}
