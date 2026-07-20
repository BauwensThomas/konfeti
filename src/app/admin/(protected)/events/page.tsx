import Link from "next/link";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const EVENTS_LIMIT = 200;

// Retour Thomas : "je vois où tout les evenements ?" -- la recherche de la
// vue d'ensemble n'affiche que ce qui matche une requête tapée, aucun moyen
// de simplement tout parcourir. Liste complète (les plus récents d'abord),
// chacun avec un lien vers la vue détail lecture seule
// (`/admin/events/[shortCode]`, voir son commentaire pour le fonctionnement).
export default async function AdminEventsListPage() {
  const admin = serviceRoleClient();

  const [{ data: events, count }, { data: profiles }] = await Promise.all([
    admin
      .from("events")
      .select("id, short_code, title, status, starts_at, date_mode, host_id", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(EVENTS_LIMIT),
    admin.from("profiles").select("id, first_name, last_name"),
  ]);

  const hostNameById = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));

  const eventIds = (events ?? []).map((e) => e.id);
  const { data: approvedRsvps } =
    eventIds.length > 0
      ? await admin.from("rsvps").select("event_id").in("event_id", eventIds).eq("status", "approved")
      : { data: [] as { event_id: string }[] };
  const participantCountByEvent = new Map<string, number>();
  for (const r of approvedRsvps ?? []) {
    participantCountByEvent.set(r.event_id, (participantCountByEvent.get(r.event_id) ?? 0) + 1);
  }

  return (
    <Card className="flex flex-col gap-3">
      <h1 className="font-display text-lg font-bold text-foreground">
        Tous les événements ({count ?? 0}{(count ?? 0) > EVENTS_LIMIT ? `, ${EVENTS_LIMIT} plus récents affichés` : ""})
      </h1>
      {!events || events.length === 0 ? (
        <p className="text-sm text-foreground/60">Aucun événement pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-konfeti border border-border p-3"
            >
              <div className="flex flex-col gap-0.5">
                <Link href={`/admin/events/${event.short_code}`} className="text-sm font-semibold text-primary">
                  {event.title}
                </Link>
                <span className="text-xs text-foreground/60">
                  {event.short_code} · organisé par {hostNameById.get(event.host_id) || "?"} ·{" "}
                  {event.date_mode === "poll" || !event.starts_at
                    ? "date en cours de vote"
                    : new Date(event.starts_at).toLocaleDateString("fr-BE")}
                </span>
              </div>
              <span className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    event.status === "cancelled" ? "bg-accent-coral/10 text-accent-coral" : "bg-accent-mint/10 text-accent-mint"
                  }`}
                >
                  {event.status === "cancelled" ? "Annulé" : "Actif"}
                </span>
                <span className="text-foreground/60">{participantCountByEvent.get(event.id) ?? 0} participant(s)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
