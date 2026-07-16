import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type HealthCheckResult = {
  db: { ok: boolean };
  stripe: { ok: boolean };
  crons: { source: string; level: "info" | "error"; message: string; createdAt: string }[];
};

async function checkDb(): Promise<boolean> {
  try {
    const { error } = await serviceRoleClient().from("feature_flags").select("key").limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function checkStripe(): Promise<boolean> {
  try {
    await stripe.balance.retrieve();
    return true;
  } catch {
    return false;
  }
}

// Back-office /admin (brief 5.8 : "DB, cron, Stripe joignables"). Factorisée
// ici plutôt que dupliquée entre la route API et la page -- évite un
// aller-retour HTTP interne pour la page elle-même.
export async function runHealthCheck(): Promise<HealthCheckResult> {
  const [dbOk, stripeOk, cronLogs] = await Promise.all([
    checkDb(),
    checkStripe(),
    serviceRoleClient()
      .from("admin_logs")
      .select("source, level, message, created_at")
      .in("source", ["cron:event-reminders", "cron:purge-old-events", "webhook:stripe"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Dernière ligne par source seulement (la requête ci-dessus ramène les 50
  // plus récentes tous sources confondues, pas un "dernier par groupe" --
  // Postgres `distinct on` demanderait une vraie fonction RPC pour un
  // panneau aussi simple, pas nécessaire ici).
  const latestBySource = new Map<string, { source: string; level: "info" | "error"; message: string; created_at: string }>();
  for (const row of cronLogs.data ?? []) {
    if (!latestBySource.has(row.source)) latestBySource.set(row.source, row);
  }

  return {
    db: { ok: dbOk },
    stripe: { ok: stripeOk },
    crons: [...latestBySource.values()].map((row) => ({
      source: row.source,
      level: row.level,
      message: row.message,
      createdAt: row.created_at,
    })),
  };
}
