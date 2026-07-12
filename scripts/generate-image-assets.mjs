// Génère les assets optimisés dans public/ et src/app/ à partir des images sources
// (images/logo.png, images/logo-texte.png). À relancer si Thomas régénère les logos
// sources avec Gemini (brief 3.3). Jamais l'inverse : ne jamais modifier les fichiers
// dans images/, ils restent les originaux.
import sharp from "sharp";
import { mkdirSync, existsSync } from "node:fs";

const CREAM = "#FFF7F5";

mkdirSync("public", { recursive: true });

// Rend transparent le blanc CONNECTÉ AU BORD d'une source opaque (flood fill
// depuis les 4 côtés de l'image), sans toucher au blanc isolé à l'intérieur
// du dessin (yeux, dents...) -- contrairement à un seuillage global naïf qui
// percerait des trous dans le personnage. Recadre ensuite (trim) et exporte
// en carré 400x400, padding transparent (voir mascotte Jour J, retour
// Thomas : un simple fond blanc plein laissait un carré visible sur les
// pages avec le motif de confettis discret).
async function makeBackgroundTransparent(inputPath, outputPath, threshold = 245) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const visited = new Uint8Array(width * height);
  const isBg = (i) => data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold;
  const stack = [];
  const pushIfBg = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    if (!isBg(idx * channels)) return;
    visited[idx] = 1;
    stack.push(idx);
  };

  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (stack.length > 0) {
    const idx = stack.pop();
    const x = idx % width;
    const y = Math.floor(idx / width);
    data[idx * channels + 3] = 0;
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }

  await sharp(data, { raw: { width, height, channels } })
    .trim()
    .resize(400, 400, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ lossless: true })
    .toFile(outputPath);
}

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

  // Version PNG dédiée à l'image Open Graph dynamique (opengraph-image.tsx) :
  // ImageResponse (next/og) embarque son propre sharp en interne, et charger
  // un deuxième sharp (le nôtre) dans le même process au moment de la requête
  // fait planter libvips (conflit de version). Pré-générée ici, hors du
  // process du serveur Next.js, pour que la route se contente d'un `readFile`.
  await mascotTrimmed
    .clone()
    .resize(220, 220, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile("public/mascot-og.png");

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

  // Emoji photo (mascotte licorne), placeholder rond affiché tant qu'aucune
  // photo de couverture/avatar n'a été choisie (remplace l'ancienne mascotte
  // à l'appareil photo, demande de Thomas). Fond blanc explicite + WebP sans
  // perte : même traitement que attention.webp/rdv.webp, la source est une
  // image opaque sur fond blanc, pas une vraie transparence (voir DECISIONS.md
  // pour le liseré de compression évité par ce choix). Seuil de trim relevé
  // à 30 (défaut 10) : un pixel résiduel très pâle loin du personnage faisait
  // sinon déborder la détection de contour bien au-delà du bras droit,
  // décentrant visuellement le personnage vers la gauche une fois recadré.
  await sharp("images/licorne.png")
    .trim({ threshold: 30 })
    .resize(300, 300, { fit: "contain", background: "#ffffff" })
    .webp({ lossless: true })
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

  // Mode Jour J (brief 4.11) : mascotte "fêtarde" (bascule Accueil pendant
  // la journée de l'événement) -- source optionnelle, générée par Thomas via
  // Gemini, fond blanc opaque (pas de vraie transparence dans la source,
  // contrairement à `images/logo.png` qui alimente `mascot.webp`). Un simple
  // fond blanc PLEIN (comme attention.png/rdv.png, de petites icônes toujours
  // vues sur fond blanc) laissait un carré bien visible ici, la mascotte
  // étant affichée sur des fonds avec le motif de confettis discret du reste
  // du site (retour Thomas, avec capture d'écran : "on voit encore les bords
  // carrés de l'image"). Fond rendu réellement transparent par flood fill
  // (pas un simple seuillage global, qui aurait aussi supprimé les yeux/dents
  // blancs du personnage) : ne rend transparent que le blanc CONNECTÉ au bord
  // de l'image, jamais un blanc isolé à l'intérieur du dessin.
  const jourJSource = "images/mascot-jourj.png";
  if (existsSync(jourJSource)) {
    await makeBackgroundTransparent(jourJSource, "public/mascot-jourj.webp");
    console.log("Mascotte Jour J générée : public/mascot-jourj.webp");
  } else {
    console.log("images/mascot-jourj.png absent : mascotte Jour J pas encore générée, étape ignorée.");
  }

  // Mascotte "FINISH" (carte "Événement terminé", brief 4.11) : d'abord
  // abandonnée avec la première version de cette carte (voir DECISIONS.md),
  // réintroduite une fois le bouton "Terminer" ajouté (déclencheur explicite,
  // plus l'ambiguïté de la bascule automatique seule). Même traitement fond
  // transparent que la mascotte Jour J ci-dessus.
  const finishSource = "images/mascot-finish.png";
  if (existsSync(finishSource)) {
    await makeBackgroundTransparent(finishSource, "public/mascot-finish.webp");
    console.log("Mascotte FINISH générée : public/mascot-finish.webp");
  } else {
    console.log("images/mascot-finish.png absent : mascotte FINISH pas encore générée, étape ignorée.");
  }

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

  // Icônes PWA (manifest.ts, brief -- splash au lancement depuis l'icône
  // ajoutée à l'écran d'accueil, retour Thomas). "any" : même traitement que
  // icon.png (fond transparent) ; "maskable" : fond opaque (CREAM, l'OS
  // découpe l'icône dans des formes variées -- cercle, squircle... -- donc
  // le dessin doit rester dans une zone de sécurité centrale, ~70% du
  // canevas ici, pour ne jamais être rogné aux bras/mains de la mascotte).
  await mascotTrimmed
    .clone()
    .resize(192, 192, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, compressionLevel: 9 })
    .toFile("public/icon-192.png");
  await mascotTrimmed
    .clone()
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, compressionLevel: 9 })
    .toFile("public/icon-512.png");
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: CREAM },
  })
    .composite([
      {
        input: await mascotTrimmed
          .clone()
          .resize(358, 358, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .toBuffer(),
        gravity: "center",
      },
    ])
    .png({ palette: true, compressionLevel: 9 })
    .toFile("public/icon-maskable-512.png");

  console.log("Assets générés : src/app/[locale]/icon.png, src/app/[locale]/apple-icon.png, public/mascot.webp, public/logo-icon.webp, public/logo-texte.webp, public/photo-placeholder.webp, public/attention.webp, public/rdv.webp, public/icon-192.png, public/icon-512.png, public/icon-maskable-512.png");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
