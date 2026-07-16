import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { formatQuantity, type BringUnit } from "@/lib/bring-units";
import {
  fetchPeriodForecasts,
  describeWeatherCode,
  shouldShowWeather,
  type WeatherIconKey,
  type WeatherLabelKey,
} from "@/lib/weather";
import { fetchAllPages } from "@/lib/pagination";

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
  // Pagination explicite (`fetchAllPages`) : PostgREST plafonne les lignes
  // par requête (souvent 1000) -- un export PDF ne doit jamais silencieusement
  // couper la liste pour un très gros événement (voir DECISIONS.md).
  type ExportRsvpRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    gender: string | null;
    answer: string;
    checked_in_at: string | null;
    arrived_home_at: string | null;
  };
  const rsvps = await fetchAllPages<ExportRsvpRow>((from, to) =>
    supabase
      .from("rsvps")
      .select("id, first_name, last_name, phone, gender, answer, checked_in_at, arrived_home_at")
      .eq("event_id", event.id)
      .eq("status", "approved")
      .order("first_name")
      .range(from, to)
      .returns<ExportRsvpRow[]>(),
  );
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

  // Retour Thomas : le PDF est réservé aux admins (voir vérification
  // `isAdmin` plus haut) -- "contribuer anonymement" protège l'identité vis-
  // à-vis des AUTRES participants, jamais vis-à-vis de l'organisateur qui
  // gère la cagnotte. Le PDF doit donc toujours montrer le montant réel en
  // face de la bonne personne, jamais de ligne "anonyme" ici.
  //
  // Retour Thomas (bug suivant) : "si une personne a donné pour la cagnotte
  // et qu'elle met je ne peux pas venir ou quitte le groupe, son nom doit
  // toujours rester pour voir qui a payé quoi, et dans le PDF" -- une
  // contribution ne doit JAMAIS être scopée aux seuls `rsvpIds` (approuvés) :
  // toutes les contributions réussies de l'événement sont récupérées ici,
  // y compris celles d'un participant parti/restreint entre-temps.
  const contributionsByRsvp = new Map<string, number>();
  // Contributeurs qui ne sont PAS dans le tableau principal (rsvpIds
  // approuvés) : parti/retiré/restreint depuis -- ce groupe n'a même plus de
  // ligne `first_name` lisible, il faut son identité via `profiles` (voir
  // `profile_id`, jamais effacé). Le cas "répond non mais reste admin
  // invisible" (rsvp toujours "approved") reste lui géré plus bas, via
  // `rsvps`/`contributionsByRsvp` directement, pas ici.
  const departedContributionsByRsvp = new Map<string, number>();
  if (event.pot_enabled) {
    // Bug réel signalé par Thomas (chiffres recalculés à la main à partir du
    // PDF) : `amount_cents` est le BRUT facturé au contributeur (frais Stripe
    // + commission Konfeti inclus), jamais ce qui arrive réellement dans la
    // cagnotte -- `net_cents` est la seule colonne cohérente avec le reste de
    // l'app (tableau de bord admin, écran de contribution).
    const { data: contribRows } = await supabase
      .from("pot_contributions")
      .select("rsvp_id, net_cents")
      .eq("event_id", event.id)
      .eq("status", "succeeded");
    const rsvpIdSet = new Set(rsvpIds);
    for (const c of contribRows ?? []) {
      if (!c.rsvp_id) continue;
      if (rsvpIdSet.has(c.rsvp_id)) {
        contributionsByRsvp.set(c.rsvp_id, (contributionsByRsvp.get(c.rsvp_id) ?? 0) + c.net_cents);
      } else {
        departedContributionsByRsvp.set(c.rsvp_id, (departedContributionsByRsvp.get(c.rsvp_id) ?? 0) + c.net_cents);
      }
    }
  }

  // Identité des contributeurs partis/restreints -- lue directement sur
  // `rsvps` (peu importe le statut, contrairement à la requête principale
  // filtrée sur "approved" plus haut) : `first_name` peut déjà être
  // anonymisé, `profile_id`, lui, ne l'est jamais tant que le compte n'est
  // pas supprimé -- repli sur `profiles` (service-role, `profiles_select_
  // own` interdirait sinon la lecture du profil de quelqu'un d'autre).
  const departedContributorsByRsvp = new Map<
    string,
    { first_name: string | null; last_name: string | null; phone: string | null; gender: string | null }
  >();
  if (departedContributionsByRsvp.size > 0) {
    const admin = createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const departedRsvpIds = [...departedContributionsByRsvp.keys()];
    const { data: departedRsvpRows } = await admin
      .from("rsvps")
      .select("id, profile_id, first_name, last_name, phone, gender")
      .in("id", departedRsvpIds);
    const missingProfileIds = (departedRsvpRows ?? [])
      .filter((r) => !r.first_name && r.profile_id)
      .map((r) => r.profile_id as string);
    const realProfileById = new Map<string, { first_name: string | null; last_name: string | null; phone: string | null }>();
    if (missingProfileIds.length > 0) {
      const { data: realProfiles } = await admin
        .from("profiles")
        .select("id, first_name, last_name, phone")
        .in("id", missingProfileIds);
      for (const p of realProfiles ?? []) {
        realProfileById.set(p.id, p);
      }
    }
    for (const r of departedRsvpRows ?? []) {
      const real = r.profile_id ? realProfileById.get(r.profile_id) : undefined;
      departedContributorsByRsvp.set(r.id, {
        first_name: r.first_name ?? real?.first_name ?? null,
        last_name: r.last_name ?? real?.last_name ?? null,
        phone: r.phone ?? real?.phone ?? null,
        gender: r.gender,
      });
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

  // Retour Thomas : un organisateur/porteur de cagnotte répondant "je ne
  // peux pas" reste "approved" (voir `update_my_answer`) tout en ne venant
  // pas -- ni le tableau "Je viens" ni "Peut-être" ne doit plus le lister,
  // il a son propre tableau plus bas.
  //
  // Retour Thomas (Phase 9) : "Je viens" et "Peut-être" séparés en deux
  // tableaux distincts, plus mélangés dans un seul avec juste une colonne
  // "Réponse" pour les distinguer.
  const toRow = (r: (typeof rsvps)[number]): CellValue[] => {
    return [
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
    ];
  };
  // `string[]` pour les colonnes à items multiples (chaque entrée devient sa
  // propre ligne dans le PDF -- retour Thomas : "sur plusieurs lignes selon
  // le nombre de choses qu'il rapporte", pas tout collé sur une seule ligne
  // qui se contente de retourner à la ligne une fois trop large).
  const yesRows: CellValue[][] = rsvps.filter((r) => r.answer === "yes").map(toRow);
  const maybeRows: CellValue[][] = rsvps.filter((r) => r.answer === "maybe").map(toRow);

  // Retour Thomas : "un tableau en dessous de l'autre avec ceux qui ne
  // viennent pas mais qui ont donné pour la cagnotte" + "il faut aussi
  // marquer le montant de la cagnotte" + "il doit avoir le numéro de
  // téléphone aussi et le sexe" -- pas les colonnes de présence
  // (Accompagnants/Qui apporte quoi/Arrivé...) qui n'ont pas de sens ici.
  // Deux origines fusionnées ici : répondu "non" en restant admin visible
  // (toujours dans `rsvps`/`contributionsByRsvp`), ET parti/retiré/restreint
  // depuis (`departedContributionsByRsvp`/`departedContributorsByRsvp`,
  // identité repêchée via `profiles`) -- retour Thomas : "son nom doit
  // toujours rester... dans le PDF" même après un départ.
  const nonAttendingContributorRows: CellValue[][] = [];
  if (event.pot_enabled) {
    for (const r of rsvps) {
      if (r.answer === "no" && (contributionsByRsvp.get(r.id) ?? 0) > 0) {
        nonAttendingContributorRows.push([
          r.first_name ?? "",
          r.last_name ?? "",
          r.phone ?? "",
          r.gender === "female" ? "Femme" : r.gender === "male" ? "Homme" : "",
          ((contributionsByRsvp.get(r.id) ?? 0) / 100).toFixed(2),
        ]);
      }
    }
    for (const [rsvpId, netCents] of departedContributionsByRsvp) {
      const identity = departedContributorsByRsvp.get(rsvpId);
      nonAttendingContributorRows.push([
        identity?.first_name ?? "",
        identity?.last_name ?? "",
        identity?.phone ?? "",
        identity?.gender === "female" ? "Femme" : identity?.gender === "male" ? "Homme" : "",
        (netCents / 100).toFixed(2),
      ]);
    }
  }
  const nonAttendingTable =
    nonAttendingContributorRows.length > 0
      ? {
          title: "Ne viennent pas, mais ont contribué à la cagnotte",
          headers: ["Prénom", "Nom", "Téléphone", "Sexe", "Cagnotte (€)"],
          rows: nonAttendingContributorRows,
          emptyMessage: "",
        }
      : null;

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
  // (date/adresse) sous le titre. Structure conservée (pas juste une chaîne
  // formatée) : retour Thomas "je veux voir des images comme sur la page
  // d'accueil" -- l'icône se dessine à partir de `icon`, voir `buildParticipantsPdf`.
  const weatherEntries: { hourLabel: string; icon: WeatherIconKey; label: string; temp: number }[] = [];
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
        const { icon, labelKey } = describeWeatherCode(code);
        const suffix = period === "nextMorning" ? " (lendemain)" : "";
        weatherEntries.push({ hourLabel: `${hour}h${suffix}`, icon, label: WEATHER_LABELS[labelKey], temp });
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

  const tables = [
    { title: "Je viens", headers, rows: yesRows, emptyMessage: "Personne n'a répondu \"je viens\" pour le moment." },
    { title: "Peut-être", headers, rows: maybeRows, emptyMessage: "Personne n'a répondu \"peut-être\" pour le moment." },
    ...(nonAttendingTable ? [nonAttendingTable] : []),
  ];

  const pdfBytes = await buildParticipantsPdf(event.title, summaryLines, metaLines, weatherEntries, mascotBuffer, tables);

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

// Icônes météo pour le PDF (retour Thomas : "je veux voir des images comme
// sur la page d'accueil") -- même tracé que `src/components/weather/WeatherIcons.tsx`
// (composants React, inutilisables tels quels dans du SVG brut/pdf-lib),
// dupliqué ici volontairement : même principe que `WEATHER_LABELS` plus haut,
// ce fichier reste indépendant de React/next-intl. `sharp` rasterise le SVG en
// PNG (même pattern que `/api/og/[shortCode]` et `/api/invitation-card/[shortCode]`,
// voir DECISIONS.md) -- pdf-lib ne sait embarquer que du PNG/JPEG, jamais du SVG.
const WEATHER_ICON_CLOUD = (fill: string) =>
  `<path d="M18 42 Q10 42 10 34 Q10 27 17 26 Q18 17 28 17 Q37 17 39 25 Q48 25 48 34 Q48 42 40 42 Z" fill="${fill}" />`;

const WEATHER_ICON_SVGS: Record<WeatherIconKey, string> = {
  sunny: `<circle cx="32" cy="32" r="14" fill="#FACC15" />
    <g stroke="#FACC15" stroke-width="4" stroke-linecap="round">
      <path d="M32 6 V12" /><path d="M32 52 V58" /><path d="M6 32 H12" /><path d="M52 32 H58" />
      <path d="M14 14 L18 18" /><path d="M46 46 L50 50" /><path d="M50 14 L46 18" /><path d="M18 46 L14 50" />
    </g>`,
  partlyCloudy: `<circle cx="24" cy="22" r="11" fill="#FACC15" />${WEATHER_ICON_CLOUD("#F9FAFB")}`,
  cloudy: WEATHER_ICON_CLOUD("#D1D5DB"),
  foggy: `${WEATHER_ICON_CLOUD("#E5E7EB")}
    <g stroke="#9CA3AF" stroke-width="3" stroke-linecap="round"><path d="M12 48 H52" /><path d="M16 54 H48" /></g>`,
  drizzle: `${WEATHER_ICON_CLOUD("#D1D5DB")}
    <g stroke="#38BDF8" stroke-width="3" stroke-linecap="round"><path d="M22 48 V52" /><path d="M32 48 V52" /><path d="M42 48 V52" /></g>`,
  rainy: `${WEATHER_ICON_CLOUD("#9CA3AF")}
    <g stroke="#38BDF8" stroke-width="4" stroke-linecap="round"><path d="M20 46 L16 58" /><path d="M32 46 L28 58" /><path d="M44 46 L40 58" /></g>`,
  snowy: `${WEATHER_ICON_CLOUD("#D1D5DB")}
    <g fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5"><circle cx="21" cy="50" r="3.5" /><circle cx="32" cy="54" r="3.5" /><circle cx="43" cy="50" r="3.5" /></g>`,
  stormy: `${WEATHER_ICON_CLOUD("#6B7280")}
    <path d="M34 44 L26 54 H32 L28 62 L40 50 H34 Z" fill="#FACC15" />`,
};

// Rasterisées une seule fois par process (les icônes ne changent jamais) --
// mêmes buffers PNG réutilisés pour toutes les requêtes suivantes, seul
// l'embed dans le PDFDocument (par requête, voir `embeddedWeatherIcons` dans
// `buildParticipantsPdf`) doit lui être refait à chaque génération.
const weatherIconPngCache = new Map<WeatherIconKey, Promise<Buffer>>();

function getWeatherIconPng(icon: WeatherIconKey): Promise<Buffer> {
  let cached = weatherIconPngCache.get(icon);
  if (!cached) {
    const svg = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${WEATHER_ICON_SVGS[icon]}</svg>`;
    cached = sharp(Buffer.from(svg)).resize(96, 96).png().toBuffer();
    weatherIconPngCache.set(icon, cached);
  }
  return cached;
}

async function buildParticipantsPdf(
  eventTitle: string,
  summaryLines: { text: string; color: RGB }[],
  metaLines: string[],
  weatherEntries: { hourLabel: string; icon: WeatherIconKey; label: string; temp: number }[],
  mascotBuffer: Buffer,
  // Un tableau titré par section (retour Thomas, Phase 9 : "Je viens" et
  // "Peut-être" séparés plutôt que mélangés avec une colonne "Réponse"),
  // plus le tableau "ne viennent pas mais ont contribué" existant -- même
  // mécanisme de rendu pour les trois, jamais un cas spécial pour le premier.
  // `emptyMessage` vide ("") : le tableau ne s'affiche pas du tout s'il n'a
  // aucune ligne (comportement historique de l'ancien "secondTable").
  tables: { title: string; headers: string[]; rows: CellValue[][]; emptyMessage: string }[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mascotImage = await doc.embedPng(mascotBuffer);

  // Icônes météo (au plus 4, une par créneau) : embarquées une seule fois par
  // icône réellement utilisée dans CE PDF, avant `drawPageChrome` (qui reste
  // une fonction synchrone -- `doc.embedPng` est asynchrone, impossible à
  // appeler depuis là sans transformer tous ses appelants en `await`).
  const weatherIconImages = new Map<WeatherIconKey, PDFImage>();
  for (const entry of weatherEntries) {
    if (!weatherIconImages.has(entry.icon)) {
      const png = await getWeatherIconPng(entry.icon);
      weatherIconImages.set(entry.icon, await doc.embedPng(png));
    }
  }

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
      // Icône avant le texte (retour Thomas : "je veux voir des images comme
      // sur la page d'accueil"), même icône que `EventWeather.tsx`.
      if (weatherEntries.length > 0) {
        // Retour Thomas : "la météo un peu plus grand" -- icônes et texte
        // agrandis par rapport à la première version.
        const weatherFontSize = 10;
        const weatherLineHeight = 15;
        const weatherIconSize = 12;
        const weatherIconGap = 5;
        let wy = y - 4;
        for (const entry of weatherEntries) {
          const text = `${entry.hourLabel} · ${entry.label} · ${Math.round(entry.temp)}°`;
          const textWidth = font.widthOfTextAtSize(text, weatherFontSize);
          const rowWidth = weatherIconSize + weatherIconGap + textWidth;
          const rowX = PAGE_WIDTH - MARGIN - rowWidth;
          const icon = weatherIconImages.get(entry.icon);
          if (icon) {
            page.drawImage(icon, { x: rowX, y: wy - 2, width: weatherIconSize, height: weatherIconSize });
          }
          page.drawText(text, {
            x: rowX + weatherIconSize + weatherIconGap,
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
      // la mascotte/du sous-titre. Encore un cran (`LINE_HEIGHT`) en plus
      // depuis l'ajout des icônes météo (retour Thomas : "le 'je viens' et
      // tout ce qui est en dessous doit descendre d'une ligne").
      y -= Math.max(MASCOT_SIZE, 34) + 12 + 16 + LINE_HEIGHT;
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
      // Retour Thomas : "il faut descendre le 'je viens' par rapport à
      // l'adresse" -- même espace que celui déjà utilisé entre deux tableaux
      // (voir `index > 0` plus bas), pas juste le reliquat de 4px d'avant.
      y -= 18;
    } else {
      page.drawText(`${eventTitle} - Liste des participants (suite)`, { x: MARGIN, y, size: 10, font, color: MUTED });
      y -= 18;
    }
    return y;
  }

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const allPages = [page];
  let y = drawPageChrome(page, true);

  // Généralisé pour dessiner N'IMPORTE QUEL tableau (colonnes/lignes
  // propres à lui, recalculées ici) -- retour Thomas : un second tableau
  // "ne viennent pas mais ont contribué à la cagnotte" doit s'afficher EN
  // DESSOUS du premier, avec ses propres colonnes (juste nom + montant, pas
  // les colonnes de présence qui n'ont pas de sens pour eux). Reste
  // qu'UNE seule fonction de rendu, appelée une fois par tableau, plutôt que
  // de dupliquer toute la logique de pagination/dessin.
  function renderTable(tableHeaders: string[], tableRows: CellValue[][], startY: number, emptyMessage: string): number {
    const columnWidths = tableHeaders.map((header, i) => {
      const noSplit = NO_WRAP_COLUMNS.has(header);
      const maxW = COLUMN_MAX_WIDTHS[header] ?? DEFAULT_COLUMN_MAX_WIDTH;
      const cap = maxW - CELL_PAD_X * 2;
      let minWidth = longestTokenWidth(header, bold, HEADER_FONT_SIZE, false, cap) + CELL_PAD_X * 2;
      for (const row of tableRows) {
        const values = Array.isArray(row[i]) ? (row[i] as string[]) : [row[i] as string];
        for (const value of values) {
          minWidth = Math.max(minWidth, longestTokenWidth(value, font, BODY_FONT_SIZE, noSplit, cap) + CELL_PAD_X * 2);
        }
      }
      return Math.min(maxW, Math.max(COLUMN_WIDTHS[header] ?? 60, minWidth));
    });
    const tableWidth = columnWidths.reduce((a, b) => a + b, 0);
    const tableLeft = Math.max(15, (PAGE_WIDTH - tableWidth) / 2);

    const boundaries: number[] = [];
    let bx = tableLeft;
    for (const w of columnWidths) {
      boundaries.push(bx);
      bx += w;
    }
    boundaries.push(bx);

    // Colonnes étroites ("Sexe", "Arrivé (Jour J)"...) : l'intitulé peut être
    // plus large que la colonne -- même retour à la ligne manuel que les
    // cellules du corps (pas le `maxWidth` auto de pdf-lib, dont le nombre de
    // lignes ne serait pas connu à l'avance pour dimensionner le bandeau).
    function drawHeaderRow(yy: number): number {
      const headerLines = tableHeaders.map((h, i) => wrapText(h, columnWidths[i] - CELL_PAD_X * 2, bold, HEADER_FONT_SIZE));
      const maxLines = Math.max(...headerLines.map((lines) => lines.length));
      const rowHeight = maxLines * (LINE_HEIGHT - 1) + ROW_PAD_Y * 2;
      page.drawRectangle({ x: tableLeft, y: yy - rowHeight, width: tableWidth, height: rowHeight, color: SKY });
      let cx = tableLeft;
      headerLines.forEach((lines, i) => {
        lines.forEach((line, li) => {
          page.drawText(line, {
            x: cx + CELL_PAD_X,
            y: yy - ROW_PAD_Y - HEADER_FONT_SIZE + 1 - li * (LINE_HEIGHT - 1),
            size: HEADER_FONT_SIZE,
            font: bold,
            color: rgb(1, 1, 1),
          });
        });
        cx += columnWidths[i];
      });
      return yy - rowHeight;
    }

    let tableTop = startY;
    let yy = drawHeaderRow(startY);

    function newPage() {
      // Grille verticale de la page précédente, du haut du tableau jusqu'à la
      // dernière ligne dessinée -- avant de passer à la page suivante. Le
      // pied de page ("page X sur Y") est dessiné après coup, une fois le
      // nombre total de pages connu.
      drawColumnGrid(page, boundaries, tableTop, yy);
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      allPages.push(page);
      yy = drawPageChrome(page, false);
      tableTop = yy;
      yy = drawHeaderRow(yy);
    }

    if (tableRows.length === 0) {
      page.drawText(emptyMessage, { x: tableLeft, y: yy - 16, size: 10, font, color: MUTED });
      yy -= 24;
    }

    tableRows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, i) =>
        cellToLines(cell, tableHeaders[i], columnWidths[i] - CELL_PAD_X * 2, font, BODY_FONT_SIZE),
      );
      const maxLines = Math.max(...cellLines.map((lines) => lines.length));
      const rowHeight = maxLines * LINE_HEIGHT + ROW_PAD_Y * 2;

      if (yy - rowHeight < MARGIN + 20) {
        newPage();
      }

      if (rowIndex % 2 === 1) {
        page.drawRectangle({ x: tableLeft, y: yy - rowHeight, width: tableWidth, height: rowHeight, color: STRIPE });
      }

      let cx = tableLeft;
      cellLines.forEach((lines, i) => {
        if (tableHeaders[i] === CHECKBOX_COLUMN) {
          // Case vide dessinée, jamais du texte (retour Thomas : "une colonne
          // pour pouvoir cocher au bic") -- centrée dans la colonne/la ligne.
          page.drawRectangle({
            x: cx + (columnWidths[i] - CHECKBOX_SIZE) / 2,
            y: yy - rowHeight / 2 - CHECKBOX_SIZE / 2,
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
            y: yy - ROW_PAD_Y - BODY_FONT_SIZE - li * LINE_HEIGHT + 1,
            size: BODY_FONT_SIZE,
            font,
            color: INK,
          });
        });
        cx += columnWidths[i];
      });

      page.drawLine({
        start: { x: tableLeft, y: yy - rowHeight },
        end: { x: tableLeft + tableWidth, y: yy - rowHeight },
        thickness: 0.5,
        color: GRID,
      });

      yy -= rowHeight;
    });

    drawColumnGrid(page, boundaries, tableTop, yy);
    return yy;
  }

  // Un titre de section + un espace au-dessus de CHAQUE tableau (retour
  // Thomas, Phase 9) -- "Je viens"/"Peut-être" désormais séparés au même
  // titre que l'ancien "second tableau" ne viennent pas/cagnotte, plus de
  // cas spécial pour le premier. Un tableau à `emptyMessage` vide ("") ne
  // s'affiche pas du tout s'il n'a aucune ligne (comportement historique).
  tables.forEach((table, index) => {
    if (table.rows.length === 0 && table.emptyMessage === "") return;

    if (index > 0) {
      y -= 24;
      if (y < MARGIN + 80) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        allPages.push(page);
        y = drawPageChrome(page, false);
      }
    }
    page.drawText(table.title, { x: MARGIN, y, size: 12, font: bold, color: INK });
    y -= 18;
    y = renderTable(table.headers, table.rows, y, table.emptyMessage);
  });

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
