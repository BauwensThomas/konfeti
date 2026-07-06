// Génère les assets optimisés dans public/ et src/app/ à partir des images sources
// (images/logo.png, images/logo-texte.png). À relancer si Thomas régénère les logos
// sources avec Gemini (brief 3.3). Jamais l'inverse : ne jamais modifier les fichiers
// dans images/, ils restent les originaux.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const CREAM = "#FFF7F5";

mkdirSync("public", { recursive: true });

async function run() {
  // Mascotte recadrée (trim des marges transparentes), source pour tout le reste
  const mascotTrimmed = sharp("images/logo.png").trim();

  // Favicon / icône app (convention Next.js, colocalisée avec le layout racine [locale])
  // palette: true -> PNG indexé 8 bits, bien plus léger pour un flat design a peu de couleurs
  await mascotTrimmed
    .clone()
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, compressionLevel: 9 })
    .toFile("src/app/[locale]/icon.png");

  // Apple touch icon : fond opaque (iOS n'aime pas la transparence)
  await mascotTrimmed
    .clone()
    .resize(400, 400, { fit: "contain", background: CREAM })
    .flatten({ background: CREAM })
    .resize(180, 180)
    .png({ palette: true, compressionLevel: 9 })
    .toFile("src/app/[locale]/apple-icon.png");

  // Mascotte seule, WebP léger et bien recadrée : pour la landing, les avatars, les emails
  await mascotTrimmed
    .clone()
    .resize(500, 500, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toFile("public/mascot.webp");

  // Version 256px, plus legere, pour les usages en petit (avatar, favicon de secours)
  await mascotTrimmed
    .clone()
    .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toFile("public/logo-icon.webp");

  // Logo complet (mascotte + texte) WebP, pour la landing / Open Graph
  await sharp("images/logo-texte.png")
    .trim()
    .resize(800, null, { withoutEnlargement: true })
    .webp({ quality: 90 })
    .toFile("public/logo-texte.webp");

  console.log("Assets générés : src/app/[locale]/icon.png, src/app/[locale]/apple-icon.png, public/mascot.webp, public/logo-icon.webp, public/logo-texte.webp");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
