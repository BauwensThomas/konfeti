// Exécute du SQL arbitraire via l'API Management Supabase (PAT requis).
// Import : import { runSql } from './sb-sql.mjs'
// CLI    : node scripts/sb-sql.mjs "SELECT ..."   ou   --file chemin.sql
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}
const pat = env.SUPABASE_ACCESS_TOKEN;
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host.split(".")[0];

export async function runSql(sql) {
  if (!pat) throw new Error("SUPABASE_ACCESS_TOKEN manquant");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Bloc CLI : uniquement si lancé directement
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  const query = arg === "--file" ? readFileSync(process.argv[3], "utf8") : arg;
  if (!query) {
    console.error("Aucune requête fournie");
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(await runSql(query), null, 2));
  } catch (e) {
    console.error("Erreur SQL:", e.message);
    process.exit(1);
  }
}
