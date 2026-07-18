// Backup hebdomadaire des données de production (retour Thomas, une fois de
// vraies données à protéger) : export JSON de toutes les tables réelles
// (pas les tables miroir events_public_data/events_pot_data/rsvps_public_data,
// dérivées par trigger des tables sources -- inutile de les dupliquer --, ni
// places_cache, un simple cache d'API externe sans valeur métier). Pas de
// photos (retour Thomas : juste les données de tables, plus léger).
//
// Lancé chaque semaine par une tâche planifiée Windows (voir
// doc/DECISIONS.md pour la commande d'enregistrement), avec rattrapage
// automatique au prochain allumage du PC si l'heure prévue a été manquée.
//
// Restauration : chaque fichier JSON peut être réinséré tel quel via
// `supabase.from(table).insert(rows)` (service-role), dans l'ordre du
// tableau TABLES (respecte les dépendances de clé étrangère -- profiles
// avant events, events avant rsvps, etc.).
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Pas de dépendance `dotenv` dans le projet : lu et parsé à la main pour que
// ce script tourne aussi bien lancé à la main (`node scripts/backup-db.mjs`)
// que par la tâche planifiée (qui passe déjà `--env-file=.env.local`, donc
// ce chargement manuel est un filet de sécurité, jamais écrasant une valeur
// déjà présente dans `process.env`).
function loadEnvLocal() {
  try {
    const content = readFileSync(join(PROJECT_ROOT, ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local absent : on suppose que l'environnement est déjà rempli
    // (ex. --env-file passé explicitement).
  }
}
loadEnvLocal();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Ordre = ordre de dépendance des clés étrangères (utile pour une
// restauration éventuelle, insert dans cet ordre).
const TABLES = [
  "profiles",
  "events",
  "rsvps",
  "companions",
  "date_options",
  "date_votes",
  "polls",
  "poll_options",
  "poll_votes",
  "bring_items",
  "bring_claims",
  "messages",
  "message_reactions",
  "chat_reads",
  "pot_contributions",
  "pot_payouts",
  "push_subscriptions",
  "scheduled_messages",
  "admin_logs",
  "feature_flags",
];

function timestampFolderName(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

async function fetchAllRows(table) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const runFolder = join(PROJECT_ROOT, "backup", timestampFolderName(new Date()));
  mkdirSync(runFolder, { recursive: true });

  console.log(`Backup Konfeti -> ${runFolder}`);
  let totalRows = 0;
  for (const table of TABLES) {
    const rows = await fetchAllRows(table);
    writeFileSync(join(runFolder, `${table}.json`), JSON.stringify(rows, null, 2), "utf8");
    console.log(`  ${table}: ${rows.length} ligne(s)`);
    totalRows += rows.length;
  }

  writeFileSync(
    join(runFolder, "_meta.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), tables: TABLES, totalRows }, null, 2),
    "utf8",
  );

  console.log(`Termine : ${totalRows} ligne(s) au total.`);
}

main().catch((err) => {
  console.error("ECHEC du backup :", err);
  process.exit(1);
});
