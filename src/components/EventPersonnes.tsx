import { createClient } from "@/lib/supabase/server";
import { PRESET_AVATARS } from "@/lib/avatars";
import { ParticipantsList, type ParticipantRow } from "@/components/ParticipantsList";

type RawRsvpRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_kind: "preset" | "photo";
  avatar_value: string | null;
  status: "pending" | "approved" | "restricted";
  role: "guest" | "admin" | "beneficiary";
  answer: "yes" | "maybe" | "no";
};

type RawPublicRsvpRow = {
  id: string;
  first_name: string | null;
  last_initial: string | null;
  avatar_kind: "preset" | "photo";
  avatar_value: string | null;
  status: "approved";
  role: "guest" | "admin" | "beneficiary";
  answer: "yes" | "maybe" | "no";
  companions_count: number;
};

// Onglet Personnes (brief 1.3/1.5) : la file d'attente + les rôles pour un
// admin, la simple liste des participants approuvés pour les autres.
export async function EventPersonnes({
  eventId,
  shortCode,
  viewerRsvpId,
  isAdmin,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
}) {
  const supabase = await createClient();

  let rows: ParticipantRow[];

  if (isAdmin) {
    const { data } = await supabase
      .from("rsvps")
      .select("id, first_name, last_name, avatar_kind, avatar_value, status, role, answer")
      .eq("event_id", eventId)
      .in("status", ["pending", "restricted", "approved"])
      .returns<RawRsvpRow[]>();

    const rsvpRows = data ?? [];
    const { data: companions } = await supabase
      .from("companions")
      .select("rsvp_id")
      .in(
        "rsvp_id",
        rsvpRows.map((r) => r.id),
      );
    const companionsCountByRsvp = new Map<string, number>();
    for (const c of companions ?? []) {
      companionsCountByRsvp.set(c.rsvp_id, (companionsCountByRsvp.get(c.rsvp_id) ?? 0) + 1);
    }

    rows = await Promise.all(
      rsvpRows.map(async (r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        status: r.status,
        role: r.role,
        answer: r.answer,
        companionsCount: companionsCountByRsvp.get(r.id) ?? 0,
      })),
    );
  } else {
    const { data } = await supabase
      .from("rsvps_public_data")
      .select("id, first_name, last_initial, avatar_kind, avatar_value, status, role, answer, companions_count")
      .eq("event_id", eventId)
      .returns<RawPublicRsvpRow[]>();

    const rsvpRows = data ?? [];
    rows = await Promise.all(
      rsvpRows.map(async (r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_initial,
        avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        status: r.status,
        role: r.role,
        answer: r.answer,
        companionsCount: r.companions_count,
      })),
    );
  }

  return (
    <ParticipantsList
      shortCode={shortCode}
      viewerRsvpId={viewerRsvpId}
      isAdmin={isAdmin}
      rows={rows}
    />
  );
}

async function resolveAvatarUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  avatarKind: "preset" | "photo",
  avatarValue: string | null,
): Promise<string | null> {
  if (!avatarValue) return null;
  if (avatarKind === "preset") {
    return PRESET_AVATARS.find((a) => a.key === avatarValue)?.path ?? null;
  }
  const { data } = await supabase.storage.from("event-photos").createSignedUrl(avatarValue, 3600);
  return data?.signedUrl ?? null;
}
