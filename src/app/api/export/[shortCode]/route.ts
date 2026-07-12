import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { formatQuantity, type BringUnit } from "@/lib/bring-units";
import { fetchPeriodForecasts, describeWeatherCode, shouldShowWeather, type WeatherLabelKey } from "@/lib/weather";

// Export PDF pour les admins (brief 4.13) : "prénom, nom, téléphone, sexe,
// réponse, accompagnants, engagements qui amène quoi, contribution cagnotte
// (sauf détail masqué), check-in Jour J." + réponses aux sondages (retour
// Thomas). Réservé aux admins, généré à la volée, jamais stocké. PDF plutôt
// que CSV (retour Thomas : "tout le monde ne sait pas utiliser CSV sur son
// téléphone") -- un tableau mis en page, lisible directement, sans logiciel
// tiers. `pdf-lib` : pur JS, pas de binaire natif ni de navigateur headless
// (contrairement à Puppeteer), compatible avec le runtime serverless Vercel
// -- même contrainte que le choix `sharp` plutôt que `next/og` pour les
// images (voir DECISIONS.md).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ shortCode: string }> },
) {
  const { shortCode } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("unauthorized", { status: 401 });
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, title, host_id, pot_enabled, date_mode, starts_at, location_text, location_lat, location_lng")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (!event) {
    return new Response("not found", { status: 404 });
  }

  const isHost = event.host_id === user.id;
  let isAdmin = isHost;
  if (!isHost) {
    const { data: myRsvp } = await supabase
      .from("rsvps")
      .select("role, status")
      .eq("event_id", event.id)
      .eq("profile_id", user.id)
      .maybeSingle();
    isAdmin = myRsvp?.status === "approved" && myRsvp?.role === "admin";
  }
  if (!isAdmin) {
    return new Response("forbidden", { status: 403 });
  }

  // Uniquement les participants APPROUVÉS par l'organisateur/un admin
  // (retour Thomas : "si l'organisateur ou l'admin n'a pas accepté la
  // demande à rejoindre l'événement, la personne ne doit pas faire partie
  // de la liste") -- la colonne "Statut" n'a alors plus lieu d'être, elle
  // vaudrait toujours "Approuvé".
  const { data: rsvpRows } = await supabase
    .from("rsvps")
    .select("id, first_name, last_name, phone, gender, answer, checked_in_at, arrived_home_at")
    .eq("event_id", event.id)
    .eq("status", "approved")
    .order("first_name");
  const rsvps = rsvpRows ?? [];
  const rsvpIds = rsvps.map((r) => r.id);

  const { data: companionRows } =
    rsvpIds.length > 0
      ? await supabase.from("companions").select("rsvp_id, kind, first_name").in("rsvp_id", rsvpIds)
      : { data: [] as { rsvp_id: string; kind: string; first_name: string | null }[] };
  const companionsByRsvp = new Map<string, string[]>();
  for (const c of companionRows ?? []) {
    const list = companionsByRsvp.get(c.rsvp_id) ?? [];
    list.push(`${companionKindLabel(c.kind)}${c.first_name ? ` (${c.first_name})` : ""}`);
    companionsByRsvp.set(c.rsvp_id, list);
  }

  const { data: claimRows } =
    rsvpIds.length > 0
      ? await supabase
          .from("bring_claims")
          .select("rsvp_id, quantity, brought, bring_items(label, unit)")
          .in("rsvp_id", rsvpIds)
          .returns<
            { rsvp_id: string; quantity: number; brought: boolean; bring_items: { label: string; unit: BringUnit } | null }[]
          >()
      : { data: [] };
  const claimsByRsvp = new Map<string, string[]>();
  for (const c of claimRows ?? []) {
    const list = claimsByRsvp.get(c.rsvp_id) ?? [];
    // Unité explicite (retour Thomas : "glaçons x1... on sait pas si c'est
    // des kg, pièce etc"), même formatage que la liste "qui apporte quoi"
    // (`formatQuantity`, `BringGauge.tsx`) -- jamais un simple "x1" muet.
    const quantityLabel = c.bring_items ? formatQuantity(c.quantity, c.bring_items.unit) : `x${c.quantity}`;
    list.push(`${c.bring_items?.label ?? "?"} ${quantityLabel}${c.brought ? " (apporté)" : ""}`);
    claimsByRsvp.set(c.rsvp_id, list);
  }

  // Réponses aux sondages (retour Thomas), uniquement les sondages déjà
  // approuvés -- même filtre que `PollsList.tsx`. Un vote référence une
  // option (`poll_votes.option_id`), jamais un sondage directement : un
  // sondage "choix unique" peut porter plusieurs unités sur une même option
  // (quota "1 + accompagnants", voir migration `polls_choice_mode_and_quantity`)
  // -- `quantity` affichée seulement si > 1, jamais un simple "x1" muet
  // (même principe que "qui apporte quoi" ci-dessus). Regroupement
  // `pollId -> [labels choisis]` avant de reformer une ligne "Question :
  // option1, option2 x3" par sondage et par invité.
  const { data: pollRows } = await supabase
    .from("polls")
    .select("id, question")
    .eq("event_id", event.id)
    .eq("status", "approved");
  const polls = pollRows ?? [];
  const pollIds = polls.map((p) => p.id);

  const { data: optionRows } =
    pollIds.length > 0
      ? await supabase.from("poll_options").select("id, poll_id, label").in("poll_id", pollIds)
      : { data: [] as { id: string; poll_id: string; label: string }[] };
  const optionById = new Map((optionRows ?? []).map((o) => [o.id, o]));

  const { data: voteRows } =
    rsvpIds.length > 0 && pollIds.length > 0
      ? await supabase.from("poll_votes").select("option_id, rsvp_id, quantity").in("rsvp_id", rsvpIds)
      : { data: [] as { option_id: string; rsvp_id: string; quantity: number }[] };
  const optionLabelsByRsvpAndPoll = new Map<string, Map<string, string[]>>();
  for (const v of voteRows ?? []) {
    const option = optionById.get(v.option_id);
    if (!option) continue;
    const byPoll = optionLabelsByRsvpAndPoll.get(v.rsvp_id) ?? new Map<string, string[]>();
    const labels = byPoll.get(option.poll_id) ?? [];
    labels.push(v.quantity > 1 ? `${option.label} x${v.quantity}` : option.label);
    byPoll.set(option.poll_id, labels);
    optionLabelsByRsvpAndPoll.set(v.rsvp_id, byPoll);
  }
  function pollLinesFor(rsvpId: string): string[] {
    const byPoll = optionLabelsByRsvpAndPoll.get(rsvpId);
    if (!byPoll) return [];
    return polls.filter((p) => byPoll.has(p.id)).map((p) => `${p.question} : ${byPoll.get(p.id)!.join(", ")}`);
  }

  const contributionsByRsvp = new Map<string, number>();
  if (event.pot_enabled) {
    const { data: contribRows } =
      rsvpIds.length > 0
        ? await supabase
            .from("pot_contributions")
            .select("rsvp_id, amount_cents")
            .in("rsvp_id", rsvpIds)
            .eq("status", "succeeded")
        : { data: [] as { rsvp_id: string | null; amount_cents: number }[] };
    for (const c of contribRows ?? []) {
      if (!c.rsvp_id) continue;
      contributionsByRsvp.set(c.rsvp_id, (contributionsByRsvp.get(c.rsvp_id) ?? 0) + c.amount_cents);
    }
  }

  // Colonne "checkbox" vide en tout premier (retour Thomas : "une colonne
  // pour pouvoir cocher au bic si l'utilisateur le souhaite") -- une vraie
  // case dessinée à l'entrée, jamais du texte (voir `CHECKBOX_COLUMN` /
  // `drawCheckbox` plus bas).
  const headers = [
    CHECKBOX_COLUMN,
    "Prénom",
    "Nom",
    "Téléphone",
    "Sexe",
    "Réponse",
    "Accompagnants",
    "Qui apporte quoi",
    ...(polls.length > 0 ? ["Sondages"] : []),
    ...(event.pot_enabled ? ["Cagnotte (€)"] : []),
    "Arrivé (Jour J)",
    "Bien rentré",
  ];

  // `string[]` pour les colonnes à items multiples (chaque entrée devient sa
  // propre ligne dans le PDF -- retour Thomas : "sur plusieurs lignes selon
  // le nombre de choses qu'il rapporte", pas tout collé sur une seule ligne
  // qui se contente de retourner à la ligne une fois trop large).
  const rows: CellValue[][] = rsvps.map((r) => [
    "",
    r.first_name ?? "",
    r.last_name ?? "",
    r.phone ?? "",
    r.gender === "female" ? "Femme" : r.gender === "male" ? "Homme" : "",
    answerLabel(r.answer),
    companionsByRsvp.get(r.id) ?? [],
    claimsByRsvp.get(r.id) ?? [],
    ...(polls.length > 0 ? [pollLinesFor(r.id)] : []),
    ...(event.pot_enabled ? [((contributionsByRsvp.get(r.id) ?? 0) / 100).toFixed(2)] : []),
    r.checked_in_at ? "Oui" : "Non",
    r.arrived_home_at ? "Oui" : "Non",
  ]);

  // Date/adresse "quand ça a été fixé" (retour Thomas) : uniquement si une
  // date ferme existe déjà -- un événement encore en sondage de dates
  // (`date_mode === "poll"`) n'a pas encore de `starts_at` à afficher.
  const metaLines: string[] = [];
  if (event.date_mode === "fixed" && event.starts_at) {
    metaLines.push(`Le ${formatEventDateTime(event.starts_at)}`);
  }
  if (event.location_text) {
    metaLines.push(event.location_text);
  }

  // Météo du jour J (retour Thomas), même source et même fenêtre J-5 que la
  // carte Accueil (`EventWeather.tsx`) -- jamais bloquant si Open-Meteo ne
  // répond pas ou si l'événement est trop loin dans le temps. Affichée à
  // droite du titre, à la même hauteur que la mascotte (retour Thomas,
  // même emplacement que sur la page live), pas mêlée aux `metaLines`
  // (date/adresse) sous le titre.
  const weatherLines: string[] = [];
  const hasCoords = event.location_lat != null && event.location_lng != null;
  if (
    shouldShowWeather(event.starts_at, event.date_mode, hasCoords) &&
    hasCoords &&
    event.starts_at
  ) {
    const forecasts = await fetchPeriodForecasts(
      event.location_lat!,
      event.location_lng!,
      event.starts_at.slice(0, 10),
    );
    if (forecasts) {
      for (const { period, hour, code, temp } of forecasts) {
        const { labelKey } = describeWeatherCode(code);
        const suffix = period === "nextMorning" ? " (lendemain)" : "";
        weatherLines.push(`${hour}h${suffix} · ${WEATHER_LABELS[labelKey]} · ${Math.round(temp)}°`);
      }
    }
  }

  // Compteur "je viens"/"peut-être"/total en gras au-dessus du tableau
  // (retour Thomas : "s'il y a des chaises à placer, on sait le nombre, ou
  // alors pour la réservation au resto") -- les accompagnants comptent aussi
  // (une chaise par personne, pas par ligne rsvps), pour "je viens" ET
  // "peut-être" (même logique de tête que le compte affiché sur l'onglet
  // Personnes, voir ParticipantsList.tsx).
  const yesRsvps = rsvps.filter((r) => r.answer === "yes");
  const yesCompanionsCount = yesRsvps.reduce((sum, r) => sum + (companionsByRsvp.get(r.id)?.length ?? 0), 0);
  const yesHeadcount = yesRsvps.length + yesCompanionsCount;
  const maybeRsvps = rsvps.filter((r) => r.answer === "maybe");
  const maybeCompanionsCount = maybeRsvps.reduce((sum, r) => sum + (companionsByRsvp.get(r.id)?.length ?? 0), 0);
  const maybeHeadcount = maybeRsvps.length + maybeCompanionsCount;
  // Détail entre parenthèses (retour Thomas : "il faut marqué entre
  // parenthèse le nombre d'invité de la personne") -- inscriptions vs
  // accompagnants, pas juste le total brut. Couleurs alignées sur le reste de
  // l'app (retour Thomas) : vert = confirmé, orange = incertain.
  const summaryLines = [
    { text: `Je viens : ${yesHeadcount} (${headcountDetail(yesRsvps.length, yesCompanionsCount)})`, color: MINT },
    { text: `Peut-être : ${maybeHeadcount} (${headcountDetail(maybeRsvps.length, maybeCompanionsCount)})`, color: ORANGE },
    { text: `Total : ${yesHeadcount + maybeHeadcount}`, color: INK },
  ];

  const mascotBuffer = await readFile(path.join(process.cwd(), "public", "mascot-og.png"));

  const pdfBytes = await buildParticipantsPdf(
    event.title,
    summaryLines,
    metaLines,
    weatherLines,
    mascotBuffer,
    headers,
    rows,
  );

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="participants-${shortCode}.pdf"`,
    },
  });
}

function companionKindLabel(kind: string): string {
  return { partner: "Conjoint(e)", child: "Enfant", friend: "Ami(e)", family: "Famille" }[kind] ?? kind;
}

function answerLabel(answer: string): string {
  return { yes: "Je viens", maybe: "Peut-être", no: "Je ne peux pas" }[answer] ?? answer;
}

// Mêmes libellés que `messages/fr.json` (`EventPage.weather`) -- ce fichier
// n'utilise pas next-intl (tous les textes du PDF sont déjà en dur, voir les
// en-têtes de colonnes ci-dessous), dupliqués ici plutôt que de faire
// dépendre une Route Handler pure du contexte next-intl pour ce seul usage.
const WEATHER_LABELS: Record<WeatherLabelKey, string> = {
  sunny: "Ensoleillé",
  partlyCloudy: "Peu nuageux",
  cloudy: "Nuageux",
  overcast: "Couvert",
  foggy: "Brouillard",
  drizzle: "Bruine",
  rainy: "Pluie",
  snowy: "Neige",
  showers: "Averses",
  snowShowers: "Averses de neige",
  stormy: "Orage",
};

function formatEventDateTime(iso: string): string {
  const date = new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${time}`;
}

// Détail entre parenthèses d'un total "je viens"/"peut-être" (retour Thomas :
// "il faut marqué entre parenthèse le nombre d'invité de la personne") --
// distingue les inscriptions elles-mêmes des accompagnants qu'elles amènent.
function headcountDetail(invitedCount: number, companionsCount: number): string {
  const invitedPart = `${invitedCount} invité${invitedCount > 1 ? "s" : ""}`;
  if (companionsCount === 0) return invitedPart;
  return `${invitedPart} + ${companionsCount} accompagnant${companionsCount > 1 ? "s" : ""}`;
}

// Une cellule est soit un texte simple, soit une liste d'entrées à afficher
// chacune sur sa propre ligne (Accompagnants, Qui apporte quoi, Sondages).
type CellValue = string | string[];

// Colonne "case à cocher" vide en tout premier (retour Thomas), identifiée
// par une clé d'en-tête vide plutôt qu'un texte -- distinguée des autres
// colonnes uniquement par sa position (index 0), voir `drawCheckbox`.
const CHECKBOX_COLUMN = "";
const CHECKBOX_SIZE = 9;

// Largeurs de colonnes (pt) -- valeurs de DÉPART seulement, indexées par
// intitulé pour rester correctes que "Sondages"/"Cagnotte (€)" soient
// présentes ou non. `computeColumnWidths` les élargit ensuite si besoin pour
// que le contenu réel ne dépasse jamais (retour Thomas : "Homme"/"Femme"
// dépassait de la colonne "Sexe") -- ce sont donc des largeurs minimales
// esthétiques, pas des largeurs garanties.
const COLUMN_WIDTHS: Record<string, number> = {
  [CHECKBOX_COLUMN]: 20,
  "Prénom": 58,
  "Nom": 58,
  "Téléphone": 78,
  "Sexe": 30,
  "Réponse": 48,
  "Accompagnants": 85,
  "Qui apporte quoi": 105,
  "Sondages": 95,
  "Cagnotte (€)": 45,
  "Arrivé (Jour J)": 45,
  "Bien rentré": 45,
};

// "Téléphone" ne doit jamais se couper au niveau d'un espace (retour Thomas :
// les espaces du numéro le faisaient sauter sur plusieurs lignes) -- traité
// comme un seul "mot" par `wrapText` (voir `noSplit`), pas littéralement
// "jamais de retour à la ligne" : un numéro anormalement long se coupe quand
// même caractère par caractère plutôt que de faire déborder la colonne.
const NO_WRAP_COLUMNS = new Set(["Téléphone"]);

// Plafond dur par colonne (pt) : un seul mot anormalement long (retour
// Thomas : "si j'écris un long mot sans espace, ça fait sortir le tableau du
// cadre" -- un prénom d'accompagnant collé sans espace poussait la colonne,
// et donc toute la page, hors cadre) ne doit jamais élargir la colonne
// au-delà de ce plafond ; `wrapText` le coupe caractère par caractère à la
// place (voir `breakLongToken`).
const COLUMN_MAX_WIDTHS: Record<string, number> = {
  [CHECKBOX_COLUMN]: 20,
  "Prénom": 85,
  "Nom": 85,
  "Téléphone": 95,
  "Sexe": 45,
  "Réponse": 70,
  "Accompagnants": 130,
  "Qui apporte quoi": 150,
  "Sondages": 140,
  "Cagnotte (€)": 60,
  "Arrivé (Jour J)": 60,
  "Bien rentré": 60,
};
const DEFAULT_COLUMN_MAX_WIDTH = 130;

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 40;
const HEADER_FONT_SIZE = 9;
const BODY_FONT_SIZE = 8.5;
const LINE_HEIGHT = 11;
const CELL_PAD_X = 4;
const WIDTH_SAFETY_MARGIN = 2;
const ROW_PAD_Y = 4;

const INK = rgb(0.18, 0.063, 0.396); // --foreground #2e1065
const SKY = rgb(0.220, 0.741, 0.973); // --color-accent-sky #38bdf8
const STRIPE = rgb(0.965, 0.961, 0.976); // teinte très claire de --color-border
const GRID = rgb(0.85, 0.83, 0.9);
const MUTED = rgb(0.5, 0.47, 0.55);
// Même code couleur que le reste de l'app (retour Thomas) : vert = confirmé
// ("Je viens", --color-accent-mint #34d399), orange = incertain ("Peut-être",
// --color-highlight #f97316).
const MINT = rgb(0.204, 0.827, 0.6);
const ORANGE = rgb(0.976, 0.451, 0.086);

const MASCOT_SIZE = 46;

async function buildParticipantsPdf(
  eventTitle: string,
  summaryLines: { text: string; color: RGB }[],
  metaLines: string[],
  weatherLines: string[],
  mascotBuffer: Buffer,
  headers: string[],
  rows: CellValue[][],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mascotImage = await doc.embedPng(mascotBuffer);

  // Coupe un seul "mot" (ou toute la valeur pour une colonne `noSplit`)
  // caractère par caractère quand il dépasse `maxWidth` à lui seul --
  // garde-fou pour un texte anormalement long sans espace (retour Thomas :
  // "si j'écris un long mot sans espace, ça fait sortir le tableau du
  // cadre"). Même filet de sécurité que la boucle appelante : si même un
  // seul caractère dépasse `maxWidth`, on l'ajoute quand même (`current`
  // vide) plutôt que de boucler sans jamais avancer.
  function breakLongToken(token: string, maxWidth: number, f: PDFFont, size: number): string[] {
    const chunks: string[] = [];
    let current = "";
    for (const ch of token) {
      const candidate = current + ch;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        chunks.push(current);
        current = ch;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
    return chunks.length > 0 ? chunks : [token];
  }

  // `noSplit` : traite tout `text` comme un seul token (jamais coupé à un
  // espace) -- utilisé pour "Téléphone", dont les espaces font partie du
  // numéro (retour Thomas : elles le faisaient sauter sur plusieurs lignes).
  // Un token (mot normal, ou `text` entier si `noSplit`) trop large pour
  // `maxWidth` est cassé caractère par caractère (`breakLongToken`) au lieu
  // de déborder -- c'est ce mécanisme, pas la largeur de colonne, qui
  // garantit qu'aucun contenu ne sort jamais du cadre.
  function wrapText(text: string, maxWidth: number, f: PDFFont, size: number, noSplit = false): string[] {
    if (!text) return [""];
    const words = noSplit ? [text] : text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      if (f.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
      } else {
        const chunks = breakLongToken(word, maxWidth, f, size);
        lines.push(...chunks.slice(0, -1));
        current = chunks[chunks.length - 1];
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }

  // Largeur plancher d'une colonne = son token le plus large, plafonnée à
  // `COLUMN_MAX_WIDTHS` -- au-delà du plafond, `wrapText`/`breakLongToken`
  // prennent le relais au rendu (plus de lignes, jamais une colonne plus
  // large que son plafond). `WIDTH_SAFETY_MARGIN` : sans cette marge, une
  // largeur calculée pile égale à la largeur du mot ("Homme" dans "Sexe")
  // pouvait encore faire sauter le dernier caractère à la ligne (retour
  // Thomas) -- `<=` dans `wrapText` laisse trop peu de marge d'arrondi.
  function longestTokenWidth(text: string, f: PDFFont, size: number, noSplit: boolean, cap: number): number {
    if (!text) return 0;
    const tokens = noSplit ? [text] : text.split(" ");
    const width = tokens.reduce((max, token) => Math.max(max, f.widthOfTextAtSize(token, size)), 0);
    return Math.min(cap, width + WIDTH_SAFETY_MARGIN);
  }

  const columnWidths = headers.map((header, i) => {
    const noSplit = NO_WRAP_COLUMNS.has(header);
    const maxW = COLUMN_MAX_WIDTHS[header] ?? DEFAULT_COLUMN_MAX_WIDTH;
    const cap = maxW - CELL_PAD_X * 2;
    let minWidth = longestTokenWidth(header, bold, HEADER_FONT_SIZE, false, cap) + CELL_PAD_X * 2;
    for (const row of rows) {
      const values = Array.isArray(row[i]) ? (row[i] as string[]) : [row[i] as string];
      for (const value of values) {
        minWidth = Math.max(minWidth, longestTokenWidth(value, font, BODY_FONT_SIZE, noSplit, cap) + CELL_PAD_X * 2);
      }
    }
    return Math.min(maxW, Math.max(COLUMN_WIDTHS[header] ?? 60, minWidth));
  });
  const tableWidth = columnWidths.reduce((a, b) => a + b, 0);
  // Centré si le contenu tient dans les marges habituelles, sinon on réduit
  // juste la marge visuelle plutôt que de laisser le tableau déborder de la
  // page (garde-fou résiduel : `COLUMN_MAX_WIDTHS` limite déjà chaque
  // colonne individuellement).
  const tableLeft = Math.max(15, (PAGE_WIDTH - tableWidth) / 2);

  const boundaries: number[] = [];
  let x = tableLeft;
  for (const w of columnWidths) {
    boundaries.push(x);
    x += w;
  }
  boundaries.push(x);

  // Une entrée de liste = un paragraphe qui commence toujours sur sa propre
  // ligne (jamais fusionnée avec la précédente), avec un retour à la ligne
  // interne si elle est elle-même trop large pour la colonne.
  function cellToLines(value: CellValue, header: string, maxWidth: number, f: PDFFont, size: number): string[] {
    if (Array.isArray(value)) {
      if (value.length === 0) return [""];
      return value.flatMap((item) => wrapText(item, maxWidth, f, size));
    }
    return wrapText(value, maxWidth, f, size, NO_WRAP_COLUMNS.has(header));
  }

  // Mascotte + titre en en-tête de la première page, date/adresse en dessous
  // (retour Thomas) -- seulement si l'événement a une date ferme ("quand ça a
  // été fixé") et/ou une adresse renseignée, jamais l'un sans l'autre forcé.
  function drawPageChrome(page: PDFPage, isFirstPage: boolean): number {
    let y = PAGE_HEIGHT - MARGIN;
    if (isFirstPage) {
      page.drawImage(mascotImage, { x: MARGIN, y: y - MASCOT_SIZE, width: MASCOT_SIZE, height: MASCOT_SIZE });
      const textX = MARGIN + MASCOT_SIZE + 14;
      page.drawText(eventTitle, { x: textX, y: y - 16, size: 16, font: bold, color: INK });
      page.drawText("Liste des participants", { x: textX, y: y - 34, size: 10, font, color: MUTED });
      // Météo à droite du titre, à la même hauteur que la mascotte (retour
      // Thomas : même emplacement que sur la page live) -- une ligne par
      // créneau, alignée à droite, empilée sur la hauteur de la mascotte.
      if (weatherLines.length > 0) {
        const weatherFontSize = 8;
        const weatherLineHeight = 10;
        let wy = y - 4;
        for (const line of weatherLines) {
          const lineWidth = font.widthOfTextAtSize(line, weatherFontSize);
          page.drawText(line, {
            x: PAGE_WIDTH - MARGIN - lineWidth,
            y: wy,
            size: weatherFontSize,
            font,
            color: MUTED,
          });
          wy -= weatherLineHeight;
        }
      }
      // Espace supplémentaire avant le compteur (retour Thomas : "trop serré
      // par rapport à la mascotte") -- un cran de plus que le simple bas de
      // la mascotte/du sous-titre.
      y -= Math.max(MASCOT_SIZE, 34) + 12 + 16;
      // Compteur "je viens"/"peut-être"/total en gras, les 3 sur UNE seule
      // ligne (retour Thomas), alignés gauche/centre/droite -- utile pour les
      // chaises à placer ou une réservation au resto.
      const [leftSummary, centerSummary, rightSummary] = summaryLines;
      page.drawText(leftSummary.text, { x: MARGIN, y, size: 12, font: bold, color: leftSummary.color });
      const centerWidth = bold.widthOfTextAtSize(centerSummary.text, 12);
      page.drawText(centerSummary.text, {
        x: (PAGE_WIDTH - centerWidth) / 2,
        y,
        size: 12,
        font: bold,
        color: centerSummary.color,
      });
      const rightWidth = bold.widthOfTextAtSize(rightSummary.text, 12);
      page.drawText(rightSummary.text, {
        x: PAGE_WIDTH - MARGIN - rightWidth,
        y,
        size: 12,
        font: bold,
        color: rightSummary.color,
      });
      y -= 20;
      for (const line of metaLines) {
        for (const wrapped of wrapText(line, PAGE_WIDTH - MARGIN * 2, font, 10)) {
          page.drawText(wrapped, { x: MARGIN, y, size: 10, font, color: INK });
          y -= 14;
        }
      }
      y -= 4;
    } else {
      page.drawText(`${eventTitle} - Liste des participants (suite)`, { x: MARGIN, y, size: 10, font, color: MUTED });
      y -= 18;
    }
    return y;
  }

  // Colonnes étroites ("Sexe", "Arrivé (Jour J)"...) : l'intitulé peut être
  // plus large que la colonne -- même retour à la ligne manuel que les
  // cellules du corps (pas le `maxWidth` auto de pdf-lib, dont le nombre de
  // lignes ne serait pas connu à l'avance pour dimensionner le bandeau).
  function drawHeaderRow(page: PDFPage, y: number): number {
    const headerLines = headers.map((h, i) => wrapText(h, columnWidths[i] - CELL_PAD_X * 2, bold, HEADER_FONT_SIZE));
    const maxLines = Math.max(...headerLines.map((lines) => lines.length));
    const rowHeight = maxLines * (LINE_HEIGHT - 1) + ROW_PAD_Y * 2;
    page.drawRectangle({ x: tableLeft, y: y - rowHeight, width: tableWidth, height: rowHeight, color: SKY });
    let cx = tableLeft;
    headerLines.forEach((lines, i) => {
      lines.forEach((line, li) => {
        page.drawText(line, {
          x: cx + CELL_PAD_X,
          y: y - ROW_PAD_Y - HEADER_FONT_SIZE + 1 - li * (LINE_HEIGHT - 1),
          size: HEADER_FONT_SIZE,
          font: bold,
          color: rgb(1, 1, 1),
        });
      });
      cx += columnWidths[i];
    });
    return y - rowHeight;
  }

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const allPages = [page];
  let y = drawPageChrome(page, true);
  let tableTop = y;
  y = drawHeaderRow(page, y);

  function newPage() {
    // Grille verticale de la page précédente, du haut du tableau jusqu'à la
    // dernière ligne dessinée -- avant de passer à la page suivante. Le
    // pied de page ("page X sur Y") est dessiné après coup, une fois le
    // nombre total de pages connu.
    drawColumnGrid(page, boundaries, tableTop, y);
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    allPages.push(page);
    y = drawPageChrome(page, false);
    tableTop = y;
    y = drawHeaderRow(page, y);
  }

  if (rows.length === 0) {
    page.drawText("Aucun participant pour le moment.", {
      x: tableLeft,
      y: y - 16,
      size: 10,
      font,
      color: MUTED,
    });
    y -= 24;
  }

  rows.forEach((row, rowIndex) => {
    const cellLines = row.map((cell, i) => cellToLines(cell, headers[i], columnWidths[i] - CELL_PAD_X * 2, font, BODY_FONT_SIZE));
    const maxLines = Math.max(...cellLines.map((lines) => lines.length));
    const rowHeight = maxLines * LINE_HEIGHT + ROW_PAD_Y * 2;

    if (y - rowHeight < MARGIN + 20) {
      newPage();
    }

    if (rowIndex % 2 === 1) {
      page.drawRectangle({ x: tableLeft, y: y - rowHeight, width: tableWidth, height: rowHeight, color: STRIPE });
    }

    let cx = tableLeft;
    cellLines.forEach((lines, i) => {
      if (headers[i] === CHECKBOX_COLUMN) {
        // Case vide dessinée, jamais du texte (retour Thomas : "une colonne
        // pour pouvoir cocher au bic") -- centrée dans la colonne/la ligne.
        page.drawRectangle({
          x: cx + (columnWidths[i] - CHECKBOX_SIZE) / 2,
          y: y - rowHeight / 2 - CHECKBOX_SIZE / 2,
          width: CHECKBOX_SIZE,
          height: CHECKBOX_SIZE,
          borderColor: INK,
          borderWidth: 0.75,
        });
        cx += columnWidths[i];
        return;
      }
      lines.forEach((line, li) => {
        page.drawText(line, {
          x: cx + CELL_PAD_X,
          y: y - ROW_PAD_Y - BODY_FONT_SIZE - li * LINE_HEIGHT + 1,
          size: BODY_FONT_SIZE,
          font,
          color: INK,
        });
      });
      cx += columnWidths[i];
    });

    page.drawLine({
      start: { x: tableLeft, y: y - rowHeight },
      end: { x: tableLeft + tableWidth, y: y - rowHeight },
      thickness: 0.5,
      color: GRID,
    });

    y -= rowHeight;
  });

  drawColumnGrid(page, boundaries, tableTop, y);

  const generatedAt = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  allPages.forEach((p, i) => {
    p.drawText(`Généré le ${generatedAt} - page ${i + 1} sur ${allPages.length}`, {
      x: MARGIN,
      y: MARGIN - 20,
      size: 7,
      font,
      color: MUTED,
    });
  });

  return doc.save();
}

function drawColumnGrid(page: PDFPage, boundariesX: number[], top: number, bottom: number) {
  for (const bx of boundariesX) {
    page.drawLine({
      start: { x: bx, y: top },
      end: { x: bx, y: bottom },
      thickness: 0.5,
      color: GRID,
    });
  }
}
