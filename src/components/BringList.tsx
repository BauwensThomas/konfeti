import { createClient } from "@/lib/supabase/server";
import { BringListClient, type BringItemView } from "@/components/bring/BringListClient";

type RawItemRow = {
  id: string;
  label: string;
  unit: "piece" | "liter" | "gram" | "kilogram";
  quantity_needed: number;
  status: "pending" | "approved";
  proposed_by_rsvp_id: string | null;
};

type RawClaimRow = {
  id: string;
  item_id: string;
  rsvp_id: string;
  quantity: number;
  brought: boolean;
};

// Onglet Participer (brief 4.4) : "qui apporte quoi" -- items définis par
// l'organisateur au wizard (voir CreateEventWizard.tsx/actions/events.ts),
// réclamations des invités résolues en batch (comme EventChat/EventPersonnes),
// délègue l'affichage + les interactions + le temps réel à BringListClient.
export async function BringList({
  eventId,
  shortCode,
  viewerRsvpId,
  isAdmin,
  readOnly = false,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  // Événement terminé (brief 4.11, retour Thomas) : garde la trace de qui a
  // apporté quoi, mais plus aucune réclamation/proposition possible.
  readOnly?: boolean;
}) {
  const supabase = await createClient();

  // RLS (`bring_items_select`) filtre déjà "approved uniquement" pour un
  // non-admin, "tout (y compris pending)" pour un admin -- une seule
  // requête suffit, pas besoin de distinguer ici.
  const { data: itemRows } = await supabase
    .from("bring_items")
    .select("id, label, unit, quantity_needed, status, proposed_by_rsvp_id")
    .eq("event_id", eventId)
    .order("label")
    .returns<RawItemRow[]>();

  const items = itemRows ?? [];
  const itemIds = items.map((i) => i.id);

  const { data: claimRows } =
    itemIds.length > 0
      ? await supabase
          .from("bring_claims")
          .select("id, item_id, rsvp_id, quantity, brought")
          .in("item_id", itemIds)
          .returns<RawClaimRow[]>()
      : { data: [] as RawClaimRow[] };

  const claims = claimRows ?? [];
  // Prénoms des réclamants ET des proposants d'items en attente (même carte,
  // une seule requête -- les deux sont des rsvp_id).
  const rsvpIds = [
    ...new Set([
      ...claims.map((c) => c.rsvp_id),
      ...items.map((i) => i.proposed_by_rsvp_id).filter((id): id is string => !!id),
    ]),
  ];
  const nameByRsvpId = new Map<string, string>();

  if (rsvpIds.length > 0) {
    if (isAdmin) {
      const { data } = await supabase.from("rsvps").select("id, first_name, last_name").in("id", rsvpIds);
      for (const r of data ?? []) {
        nameByRsvpId.set(r.id, `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Anonyme");
      }
    } else {
      const { data } = await supabase
        .from("rsvps_public_data")
        .select("id, first_name, last_initial")
        .in("id", rsvpIds);
      for (const r of data ?? []) {
        nameByRsvpId.set(r.id, `${r.first_name ?? ""} ${r.last_initial ?? ""}`.trim() || "Anonyme");
      }
    }
  }

  const itemViews: BringItemView[] = items.map((item) => ({
    id: item.id,
    label: item.label,
    unit: item.unit,
    quantityNeeded: item.quantity_needed,
    status: item.status,
    proposedByName: item.proposed_by_rsvp_id ? (nameByRsvpId.get(item.proposed_by_rsvp_id) ?? "Anonyme") : null,
    claims: claims
      .filter((c) => c.item_id === item.id)
      .map((c) => ({
        id: c.id,
        rsvpId: c.rsvp_id,
        quantity: c.quantity,
        brought: c.brought,
        name: nameByRsvpId.get(c.rsvp_id) ?? "Anonyme",
        isMine: c.rsvp_id === viewerRsvpId,
      })),
  }));

  return (
    <BringListClient
      eventId={eventId}
      shortCode={shortCode}
      viewerRsvpId={viewerRsvpId}
      isAdmin={isAdmin}
      initialItems={itemViews}
      readOnly={readOnly}
    />
  );
}
