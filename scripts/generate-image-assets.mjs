// Génère les assets optimisés dans public/ et src/app/ à partir des images sources
// (images/logo.png, images/logo-texte.png). À relancer si Thomas régénère les logos
// sources avec Gemini (brief 3.3). Jamais l'inverse : ne jamais modifier les fichiers
// dans images/, ils restent les originaux.
import sharp from "sharp";
import { mkdirSync, existsSync } from "node:fs";

const CREAM = "#FFF7F5";

mkdirSync("public", { recursive: true });

async function run() {
  // Mascotte recadrée (trim des marges transparentes), source pour tout le reste
  const mascotTrimmed = sharp("images/logo.png").trim();

  // Favicon / icône app (convention Next.js, colocalisée avec le layout racine [locale])
  // palette: true -> PNG indexé 8 bits, bien plus léger pour un flat design à peu de couleurs
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

  // Version 256px, plus légère, pour les usages en petit (avatar, favicon de secours)
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

  // Emoji photo (mascotte à l'appareil photo), placeholder rond affiché tant
  // qu'aucune photo de couverture n'a été choisie pour un événement
  await sharp("images/photo.png")
    .trim()
    .resize(300, 300, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toFile("public/photo-placeholder.webp");

  // Emoji attention (triangle d'avertissement), affiché dans les popups
  // changer/supprimer une photo (demande de Thomas). Fond blanc explicite
  // (et pas le noir par défaut de sharp) : la source est un JPEG opaque sans
  // transparence, sur fond quasi blanc comme les popups (bg-surface).
  // Encodage WebP sans perte (lossless) : en qualité 90 (avec perte), la
  // compression introduisait un léger liseré gris à la frontière entre le
  // personnage et le remplissage blanc (artefact classique de compression
  // sur un bord net) — invisible en lossless, qui préserve le blanc exact.
  await sharp("images/attention.png")
    .trim()
    .resize(220, 220, { fit: "contain", background: "#ffffff" })
    .webp({ lossless: true })
    .toFile("public/attention.webp");

  // Emoji rendez-vous (mascotte avec un agenda), affiché à côté de la date
  // sur la page événement (demande de Thomas)
  await sharp("images/rdv.png")
    .trim()
    .resize(240, 240, { fit: "contain", background: "#ffffff" })
    .webp({ lossless: true })
    .toFile("public/rdv.webp");

  // Pack d'avatars "maison" (brief 1.1) : une grille 4x2 générée par Gemini
  // (voir doc/mascotte-style.md pour le prompt), une case par personnage.
  // On découpe chaque case, on la recadre (trim) sur son propre fond blanc
  // uniforme pour ne garder que le personnage, puis export WebP sans perte
  // (même raison que attention.webp/rdv.webp : évite le liseré gris de la
  // compression avec perte sur un bord net).
  const avatarsSource = "images/avatars.png";
  if (existsSync(avatarsSource)) {
    mkdirSync("public/avatars", { recursive: true });
    const cols = 4;
    const rows = 2;
    const { width, height } = await sharp(avatarsSource).metadata();
    const cellWidth = Math.floor(width / cols);
    const cellHeight = Math.floor(height / rows);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col + 1;
        // Chaîner extract() puis trim() dans un seul pipeline sharp ne
        // fonctionne pas ici (trim() ne rogne rien, quelle que soit la case) :
        // matérialiser la case en buffer d'abord, puis repartir d'un sharp()
        // neuf pour le trim, contourne ce problème. Seuil relevé à 60 (défaut
        // 10) : le fond de la grille Gemini n'est pas un blanc pur uniforme
        // (léger bruit/gris ~230-253), un seuil bas ne détecte quasiment rien
        // à rogner.
        const cellBuffer = await sharp(avatarsSource)
          .extract({ left: col * cellWidth, top: row * cellHeight, width: cellWidth, height: cellHeight })
          .toBuffer();
        await sharp(cellBuffer)
          .trim({ threshold: 60 })
          .resize(240, 240, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ lossless: true })
          .toFile(`public/avatars/avatar-${index}.webp`);
      }
    }
    console.log("Avatars générés : public/avatars/avatar-1.webp ... avatar-8.webp");
  } else {
    console.log("images/avatars.png absent : pack d'avatars pas encore généré, étape ignorée.");
  }

  console.log("Assets générés : src/app/[locale]/icon.png, src/app/[locale]/apple-icon.png, public/mascot.webp, public/logo-icon.webp, public/logo-texte.webp, public/photo-placeholder.webp, public/attention.webp, public/rdv.webp");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
