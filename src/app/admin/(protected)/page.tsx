import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { ResendMagicLinkForm } from "@/components/admin/ResendMagicLinkForm";
import { EventCorrectionForm } from "@/components/admin/EventCorrectionForm";
import { ForceApproveButton } from "@/components/admin/ForceApproveButton";
import { listAllAuthUsers } from "@/lib/admin-users";
import { fetchAllPages } from "@/lib/pagination";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Vue d'ensemble du back-office (brief 5.8) : compteurs globaux + recherche
// (événements / participants en attente) avec les fiches modifiables
// rattachées directement aux résultats trouvés.
export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const admin = serviceRoleClient();

  const [{ count: eventsCount }, { count: profilesCount }, { count: blockedCount }, contributions] =
    await Promise.all([
      admin.from("events").select("id", { count: "exact", head: true }),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("rsvps").select("id", { count: "exact", head: true }).eq("blocked", true),
      // `{count: "exact", head: true}` (au-dessus) n'est jamais plafonné par
      // PostgREST (aucune ligne renvoyée, juste un total calculé côté
      // serveur) -- mais ici on a besoin des VALEURS (`net_cents`), donc
      // pagination explicite requise (voir `fetchAllPages`).
      fetchAllPages<{ net_cents: number | null }>((from, to) =>
        admin.from("pot_contributions").select("net_cents").eq("status", "succeeded").range(from, to),
      ),
    ]);

  const totalCollectedCents = contributions.reduce((sum, c) => sum + (c.net_cents ?? 0), 0);

  let matchingEvents: { id: string; title: string; short_code: string; starts_at: string | null; status: string }[] = [];
  let matchingParticipants: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    status: string;
    event_title: string;
  }[] = [];

  if (q && q.trim().length > 0) {
    const query = q.trim();

    // Email : jamais stocké sur `profiles` (uniquement dans auth.users, côté
    // Supabase Auth) -- listUsers() ne supporte pas un filtre serveur par
    // email dans cette version de supabase-js, filtré ici en mémoire.
    // `listAllAuthUsers` pagine jusqu'au bout (une seule page ne suffit plus
    // dès qu'il y a plus de 1000 comptes -- déjà proche avec le bruit e2e
    // accumulé cette session, retour Thomas).
    const looksLikeEmail = query.includes("@");
    let profileIdsFromEmail: string[] = [];
    if (looksLikeEmail) {
      const allUsers = await listAllAuthUsers(admin);
      profileIdsFromEmail = allUsers
        .filter((u) => u.email?.toLowerCase().includes(query.toLowerCase()))
        .map((u) => u.id);
    }

    const [{ data: events }, { data: rsvpsByName }, { data: rsvpsByEmail }] = await Promise.all([
      admin
        .from("events")
        .select("id, title, short_code, starts_at, status")
        .or(`title.ilike.%${query}%,short_code.ilike.%${query}%`)
        .limit(20),
      // Tous les statuts (pas seulement "pending") : sinon un participant
      // déjà approuvé (le cas le plus fréquent) n'apparaît jamais du tout.
      admin
        .from("rsvps")
        // `events!rsvps_event_id_fkey` (pas juste `events`) : PostgREST voit
        // aussi le chemin indirect via `chat_reads` entre ces deux tables et
        // refuse sinon de choisir tout seul (erreur PGRST201, requête qui
        // échoue silencieusement -- bug réel trouvé en testant la recherche
        // avec Thomas, zéro résultat peu importe ce qui était tapé).
        .select("id, first_name, last_name, status, events!rsvps_event_id_fkey(title)")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(20),
      profileIdsFromEmail.length > 0
        ? admin
            .from("rsvps")
            // `events!rsvps_event_id_fkey` (pas juste `events`) : PostgREST voit
        // aussi le chemin indirect via `chat_reads` entre ces deux tables et
        // refuse sinon de choisir tout seul (erreur PGRST201, requête qui
        // échoue silencieusement -- bug réel trouvé en testant la recherche
        // avec Thomas, zéro résultat peu importe ce qui était tapé).
        .select("id, first_name, last_name, status, events!rsvps_event_id_fkey(title)")
            .in("profile_id", profileIdsFromEmail)
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);

    matchingEvents = events ?? [];

    const byId = new Map<string, { id: string; first_name: string | null; last_name: string | null; status: string; event_title: string }>();
    for (const r of [...(rsvpsByName ?? []), ...(rsvpsByEmail ?? [])]) {
      byId.set(r.id, {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        status: r.status,
        event_title: (r.events as unknown as { title: string } | null)?.title ?? "?",
      });
    }
    matchingParticipants = [...byId.values()];
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Événements" value={eventsCount ?? 0} />
        <StatCard label="Comptes" value={profilesCount ?? 0} />
        <StatCard label="Bloqués" value={blockedCount ?? 0} />
        <StatCard label="Cagnotte collectée" value={`${(totalCollectedCents / 100).toFixed(2)} €`} />
      </section>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-foreground">Renvoyer un lien de connexion</h2>
        <ResendMagicLinkForm />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-bold text-foreground">Recherche</h2>
        <form className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Titre d'événement, code, prénom, nom..."
            className="flex-1 rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-foreground/50"
          />
          <button
            type="submit"
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Chercher
          </button>
        </form>

        {q && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground/70">Événements ({matchingEvents.length})</h3>
              {matchingEvents.length === 0 ? (
                <p className="text-sm text-foreground/60">Aucun résultat.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {matchingEvents.map((event) => (
                    <li key={event.id} className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
                      <p className="text-sm text-foreground/70">
                        {event.short_code} ({event.status})
                      </p>
                      <EventCorrectionForm
                        eventId={event.id}
                        title={event.title}
                        startsAt={event.starts_at}
                        cancelled={event.status === "cancelled"}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground/70">
                Participants ({matchingParticipants.length}), par prénom/nom ou email (email : recherche exacte
                incluant &quot;@&quot;)
              </h3>
              {matchingParticipants.length === 0 ? (
                <p className="text-sm text-foreground/60">Aucun résultat.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {matchingParticipants.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-konfeti border border-border p-3"
                    >
                      <span className="text-sm text-foreground">
                        {row.first_name} {row.last_name} ({row.event_title}, {row.status})
                      </span>
                      {row.status === "pending" && <ForceApproveButton rsvpId={row.id} />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="flex flex-col items-center gap-1 text-center">
      <span className="font-display text-2xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-foreground/60">{label}</span>
    </Card>
  );
}
