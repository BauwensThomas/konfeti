import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Hôte + admins (co-organisateurs) d'un événement -- même définition que
// `is_event_admin` côté SQL (rls_helpers.sql), mais il n'existe pas
// d'équivalent TS appelable depuis une action : reproduit ici pour cibler
// les notifications push ("nouvelle demande", "produit proposé", etc.).
export async function getEventAdminUserIds(supabase: SupabaseClient, eventId: string): Promise<string[]> {
  const [{ data: event }, { data: adminRsvps }] = await Promise.all([
    supabase.from("events").select("host_id").eq("id", eventId).single(),
    supabase.from("rsvps").select("profile_id").eq("event_id", eventId).eq("role", "admin").eq("status", "approved"),
  ]);

  const ids = new Set<string>();
  if (event?.host_id) ids.add(event.host_id);
  for (const row of adminRsvps ?? []) {
    if (row.profile_id) ids.add(row.profile_id);
  }
  return [...ids];
}

// Tous les participants approuvés (+ hôte) d'un événement. `channel`
// optionnel : pour "backstage" (Coulisses), exclut les bénéficiaires quand
// le canal leur est masqué -- même logique que la visibilité calculée
// aujourd'hui côté page (`e/[shortCode]/page.tsx`, `beneficiary_hidden_blocks`),
// reproduite ici pour ne pas notifier quelqu'un qui n'a pas accès au canal.
export async function getEventApprovedUserIds(
  supabase: SupabaseClient,
  eventId: string,
  options?: { channel?: "main" | "backstage" },
): Promise<string[]> {
  const [{ data: event }, { data: rsvps }] = await Promise.all([
    supabase.from("events").select("host_id, beneficiary_hidden_blocks").eq("id", eventId).single(),
    supabase.from("rsvps").select("profile_id, role").eq("event_id", eventId).eq("status", "approved"),
  ]);

  const hideBackstageFromBeneficiaries =
    options?.channel === "backstage" && !!event?.beneficiary_hidden_blocks?.includes("backstage");

  const ids = new Set<string>();
  if (event?.host_id) ids.add(event.host_id);
  for (const row of rsvps ?? []) {
    if (!row.profile_id) continue;
    if (hideBackstageFromBeneficiaries && row.role === "beneficiary") continue;
    ids.add(row.profile_id);
  }
  return [...ids];
}
