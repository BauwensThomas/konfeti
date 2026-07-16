import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

// Back-office /admin (Phase 9, panneau "santé") : trace du dernier passage
// des scripts planifiés (crons Vercel, webhook Stripe) -- rien n'était
// persisté jusqu'ici (juste un JSON renvoyé à Vercel). `admin_logs` est
// service-role uniquement (voir la migration), jamais lue ni écrite par un
// client normal. Best-effort : ne doit jamais faire échouer l'appelant si
// l'insertion elle-même rate.
export async function logAdminEvent(source: string, level: "info" | "error", message: string): Promise<void> {
  try {
    const admin = createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await admin.from("admin_logs").insert({ source, level, message });
  } catch {
    // Best-effort.
  }
}
