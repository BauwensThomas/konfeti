// Helper partagé : client Supabase service-role (lecture/écriture toutes tables + storage).
// Lit .env.local localement, n'expose aucun secret.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

export const PROJECT_HOST = new URL(env.NEXT_PUBLIC_SUPABASE_URL).host;
export const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
