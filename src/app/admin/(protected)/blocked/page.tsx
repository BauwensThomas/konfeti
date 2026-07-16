import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { UnblockButtonAdmin } from "@/components/admin/UnblockButtonAdmin";
import { listAllAuthUsers } from "@/lib/admin-users";
import { fetchAllPages } from "@/lib/pagination";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type BlockedRsvpRow = {
  id: string;
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  last_ip: string | null;
  blocked_at: string | null;
  events: { title: string; short_code: string } | null;
};

// Vue globale (tous événements) des personnes bloquées (Phase 9, retour
// Thomas) -- contrairement à la section "Bloqués" de chaque onglet
// Personnes (par événement), celle-ci sert à repérer un même fauteur de
// troubles à travers plusieurs événements (même IP qui revient, par ex.).
export default async function AdminBlockedPage() {
  const admin = serviceRoleClient();
  const rows = await fetchAllPages<BlockedRsvpRow>((from, to) =>
    admin
      .from("rsvps")
      .select("id, profile_id, first_name, last_name, last_ip, blocked_at, events!rsvps_event_id_fkey(title, short_code)")
      .eq("blocked", true)
      .order("blocked_at", { ascending: false })
      .range(from, to)
      .returns<BlockedRsvpRow[]>(),
  );

  // Email jamais stocké sur `rsvps`/`profiles` (uniquement auth.users).
  const profileIds = [...new Set(rows.map((r) => r.profile_id).filter((id): id is string => !!id))];
  const emailByProfileId = new Map<string, string>();
  if (profileIds.length > 0) {
    const allUsers = await listAllAuthUsers(admin);
    for (const u of allUsers) {
      if (profileIds.includes(u.id) && u.email) emailByProfileId.set(u.id, u.email);
    }
  }

  const blocked = rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.profile_id ? (emailByProfileId.get(r.profile_id) ?? null) : null,
    lastIp: r.last_ip,
    blockedAt: r.blocked_at,
    eventTitle: r.events?.title ?? "?",
    eventShortCode: r.events?.short_code ?? "",
  }));

  return (
    <Card className="flex flex-col gap-3">
      <h1 className="font-display text-lg font-bold text-foreground">Bloqués (tous événements)</h1>
      {blocked.length === 0 ? (
        <p className="text-sm text-foreground/60">Personne n&apos;est bloqué pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {blocked.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 rounded-konfeti border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {row.firstName} {row.lastName}
                </span>
                <UnblockButtonAdmin rsvpId={row.id} />
              </div>
              <span className="text-xs text-foreground/60">Email : {row.email ?? "inconnu"}</span>
              <span className="text-xs text-foreground/60">
                Événement : {row.eventTitle} ({row.eventShortCode})
              </span>
              <span className="text-xs text-foreground/60">
                Bloqué le : {row.blockedAt ? new Date(row.blockedAt).toLocaleString("fr-FR") : "?"}
              </span>
              <span className="text-xs text-foreground/60">IP de la dernière soumission : {row.lastIp ?? "inconnue"}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
