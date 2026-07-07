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

// Sans 0/O/1/I (ambigus à l'oeil). 32 symboles : 256 (un octet) est un
// multiple exact de 32, donc `byte % 32` est parfaitement uniforme, aucun
// biais de modulo à corriger.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/**
 * Génère le code court d'un événement (ex. "FIESTA-K3M9QZPX"), brief 1.2.
 * C'est le seul "verrou" de la page événement avant validation (brief 1.3) :
 * le suffixe est un tirage aléatoire cryptographique sur 8 caractères
 * (32^8 ≈ 1,1 * 10^12 combinaisons), pas une simple séquence de chiffres,
 * pour qu'énumérer tous les codes possibles (ex. EVG-0001, EVG-0002...) soit
 * infaisable en pratique. Avant ce changement, le suffixe n'était qu'un
 * nombre à 4 chiffres (72 000 combinaisons au total, énumérable en minutes) —
 * problème remonté par Thomas.
 */
export function generateShortCode(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${word}-${randomSuffix(8)}`;
}
