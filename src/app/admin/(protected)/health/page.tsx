import { Card } from "@/components/ui/Card";
import { runHealthCheck } from "@/lib/health-check";

const CRON_LABELS: Record<string, string> = {
  "cron:event-reminders": "Cron relances (Brevo/push)",
  "cron:purge-old-events": "Cron purge des événements",
  "webhook:stripe": "Webhook Stripe",
};

export default async function AdminHealthPage() {
  const health = await runHealthCheck();

  return (
    <Card className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-bold text-foreground">Santé</h1>

      <div className="flex flex-col gap-2">
        <StatusRow label="Base de données (Supabase)" ok={health.db.ok} />
        <StatusRow label="Stripe" ok={health.stripe.ok} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground/70">Derniers passages</h2>
        {health.crons.length === 0 ? (
          <p className="text-sm text-foreground/60">Aucun passage enregistré pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {health.crons.map((entry) => (
              <li
                key={entry.source}
                className="flex flex-wrap items-center justify-between gap-2 rounded-konfeti border border-border p-3"
              >
                <span className="text-sm font-semibold text-foreground">{CRON_LABELS[entry.source] ?? entry.source}</span>
                <span className={`text-sm ${entry.level === "error" ? "text-accent-coral" : "text-accent-mint"}`}>
                  {entry.message}
                </span>
                <span className="text-xs text-foreground/60">{new Date(entry.createdAt).toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-konfeti border border-border p-3">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className={`text-sm font-semibold ${ok ? "text-accent-mint" : "text-accent-coral"}`}>
        {ok ? "OK" : "Injoignable"}
      </span>
    </div>
  );
}
