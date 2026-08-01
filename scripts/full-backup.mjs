// Backup complet Supabase (hors dump SQL, géré par backup-supabase.ps1 via pg_dump) :
// - storage : tous les buckets, tous les fichiers, arborescence préservée
//   -> synchronisé de façon incrémentale dans un dossier PERSISTANT (storageMirrorDir),
//      pas re-téléchargé en entier à chaque backup (les fichiers ne changent presque jamais).
//      Seul un manifeste (léger) va dans le zip.
// - auth : liste des utilisateurs (Supabase Auth)
// - advisors : lints sécurité + performance (Management API)
// - tables : métadonnées (colonnes, lignes, taille) par table (Management API)
// - données de tables en JSON lisible, sauf les tables déjà couvertes autrement par
//   full_dump.sql et sans valeur "métier" à relire à la main
// - edge functions : liste des fonctions déployées (vide si aucune)
//
// Usage : node scripts/full-backup.mjs <dossier_de_sortie> <dossier_mirror_storage>
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { sb } from "./_sb.mjs";
import { runSql } from "./sb-sql.mjs";

const outDir = process.argv[2];
const storageMirrorDir = process.argv[3] || path.join(outDir, "storage");
if (!outDir) {
  console.error("Usage : node scripts/full-backup.mjs <dossier_de_sortie> <dossier_mirror_storage>");
  process.exit(1);
}

// Tables miroir de confidentialité (régénérées par trigger depuis les tables sources,
// aucune valeur propre à sauvegarder) + cache d'API externe (régénère naturellement) --
// même exclusion que l'ancien scripts/backup-db.mjs, déjà couvertes par full_dump.sql.
const SKIP_JSON_TABLES = new Set([
  "events_public_data",
  "events_pot_data",
  "rsvps_public_data",
  "places_cache",
]);

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const pat = env.SUPABASE_ACCESS_TOKEN;
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];

function writeJson(relPath, data) {
  const full = path.join(outDir, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2));
}

async function backupStorage() {
  const { data: buckets, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);

  const manifest = [];
  for (const bucket of buckets) {
    await downloadFolder(bucket.name, "", manifest);
  }
  // Le manifeste (liste + tailles + statut) va dans le zip hebdo ; les fichiers eux-mêmes
  // restent dans le mirror persistant (storageMirrorDir), pas dans le dossier daté.
  writeJson("storage/_manifest.json", manifest);
  const downloaded = manifest.filter((m) => m.status === "downloaded").length;
  const cached = manifest.filter((m) => m.status === "cached").length;
  console.log(
    `  storage : ${manifest.length} fichiers sur ${buckets.length} buckets (${downloaded} téléchargés, ${cached} déjà à jour en cache)`,
  );
}

async function downloadFolder(bucketName, folder, manifest) {
  const { data: entries, error } = await sb.storage.from(bucketName).list(folder, { limit: 1000 });
  if (error) throw new Error(`list ${bucketName}/${folder}: ${error.message}`);

  for (const entry of entries) {
    if (entry.name === ".emptyFolderPlaceholder") continue;
    const entryPath = folder ? `${folder}/${entry.name}` : entry.name;
    const isFolder = entry.id === null;

    if (isFolder) {
      await downloadFolder(bucketName, entryPath, manifest);
      continue;
    }

    const localPath = path.join(storageMirrorDir, bucketName, entryPath);
    const remoteSize = entry.metadata?.size;

    if (remoteSize != null && existsSync(localPath) && statSync(localPath).size === remoteSize) {
      manifest.push({ bucket: bucketName, path: entryPath, bytes: remoteSize, status: "cached" });
      continue;
    }

    const { data: blob, error: dlError } = await sb.storage.from(bucketName).download(entryPath);
    if (dlError) {
      manifest.push({ bucket: bucketName, path: entryPath, error: dlError.message, status: "error" });
      continue;
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    mkdirSync(path.dirname(localPath), { recursive: true });
    writeFileSync(localPath, buf);
    manifest.push({ bucket: bucketName, path: entryPath, bytes: buf.length, status: "downloaded" });
  }
}

async function backupAuth() {
  const users = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }
  writeJson("auth/users.json", users);
  console.log(`  auth : ${users.length} utilisateur(s)`);
}

async function backupAdvisors() {
  if (!pat) {
    console.warn("  advisors : SUPABASE_ACCESS_TOKEN manquant, étape ignorée");
    return;
  }
  for (const type of ["security", "performance"]) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/${type}`, {
      headers: { Authorization: `Bearer ${pat}` },
    });
    if (!res.ok) {
      console.warn(`  advisors ${type} : HTTP ${res.status}`);
      continue;
    }
    const json = await res.json();
    writeJson(`advisors/${type}.json`, json);
  }
  console.log("  advisors : OK");
}

async function backupTablesInfo() {
  if (!pat) {
    console.warn("  tables info : SUPABASE_ACCESS_TOKEN manquant, étape ignorée");
    return;
  }
  const tables = await runSql(`
    SELECT relname AS table_name, n_live_tup AS row_estimate,
           pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
           pg_total_relation_size(relid) AS total_size_bytes
    FROM pg_stat_user_tables
    ORDER BY relname;
  `);
  const columns = await runSql(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);
  writeJson("database/tables_info.json", { tables, columns });
  console.log(`  tables info : ${Array.isArray(tables) ? tables.length : "?"} tables`);
}

async function backupTableData() {
  if (!pat) {
    console.warn("  données tables : SUPABASE_ACCESS_TOKEN manquant, étape ignorée");
    return;
  }
  const baseTables = await runSql(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  let count = 0;
  let skipped = 0;
  for (const { table_name } of baseTables) {
    if (SKIP_JSON_TABLES.has(table_name)) {
      skipped += 1;
      continue;
    }
    try {
      const rows = await runSql(`SELECT * FROM public."${table_name}";`);
      writeJson(`database/tables/${table_name}.json`, rows);
      count += 1;
    } catch (e) {
      console.warn(`  ${table_name} : ${e.message}`);
    }
  }
  console.log(`  données tables : ${count}/${baseTables.length} tables exportées en JSON (${skipped} ignorées, déjà dans full_dump.sql)`);
}

async function backupEdgeFunctions() {
  if (!pat) {
    console.warn("  edge functions : SUPABASE_ACCESS_TOKEN manquant, étape ignorée");
    return;
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  const list = res.ok ? await res.json() : [];
  writeJson("edge_functions/functions.json", list);
  console.log(`  edge functions : ${list.length}`);
}

const steps = [
  ["tables info", backupTablesInfo],
  ["données tables (JSON)", backupTableData],
  ["advisors", backupAdvisors],
  ["edge functions", backupEdgeFunctions],
  ["auth", backupAuth],
  ["storage", backupStorage],
];

let hadError = false;
for (const [label, fn] of steps) {
  try {
    console.log(`> ${label}...`);
    await fn();
  } catch (e) {
    hadError = true;
    console.error(`  ERREUR ${label} :`, e.message);
  }
}

process.exit(hadError ? 1 : 0);
