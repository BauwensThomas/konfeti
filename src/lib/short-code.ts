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
