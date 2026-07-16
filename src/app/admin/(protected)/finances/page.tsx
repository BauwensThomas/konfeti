import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { fetchAllPages } from "@/lib/pagination";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type ContributionRow = { fee_konfeti_cents: number | null; net_cents: number | null; created_at: string };

// Total des commissions Konfeti perçues, par mois (brief 5.8) -- même
// colonne (`fee_konfeti_cents`) et même calcul que `PotAdminDashboard.tsx`,
// agrégé tous événements confondus plutôt qu'un seul. Pagination explicite
// (`fetchAllPages`) : un simple `.select()` sans `.range()` serait plafonné
// par PostgREST dès que le nombre de contributions dépasse la limite par
// page, faussant silencieusement le total affiché.
export default async function AdminFinancesPage() {
  const admin = serviceRoleClient();
  const contributions = await fetchAllPages<ContributionRow>((from, to) =>
    admin
      .from("pot_contributions")
      .select("fee_konfeti_cents, net_cents, created_at")
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<ContributionRow[]>(),
  );

  const byMonth = new Map<string, { commissionCents: number; netCents: number; count: number }>();
  for (const c of contributions) {
    const month = c.created_at.slice(0, 7); // "YYYY-MM"
    const entry = byMonth.get(month) ?? { commissionCents: 0, netCents: 0, count: 0 };
    entry.commissionCents += c.fee_konfeti_cents ?? 0;
    entry.netCents += c.net_cents ?? 0;
    entry.count += 1;
    byMonth.set(month, entry);
  }

  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <Card className="flex flex-col gap-3">
      <h1 className="font-display text-lg font-bold text-foreground">Finances</h1>
      {months.length === 0 ? (
        <p className="text-sm text-foreground/60">Aucune contribution réussie pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {months.map(([month, entry]) => (
            <li key={month} className="flex items-center justify-between gap-2 rounded-konfeti border border-border p-3">
              <span className="text-sm font-semibold text-foreground">{month}</span>
              <span className="text-sm text-foreground/70">{entry.count} contribution(s)</span>
              <span className="text-sm text-foreground/70">{(entry.netCents / 100).toFixed(2)} € collectés</span>
              <span className="text-sm font-semibold text-accent-mint">
                {(entry.commissionCents / 100).toFixed(2)} € de commission
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
