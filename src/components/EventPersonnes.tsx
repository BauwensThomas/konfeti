import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl } from "@/lib/avatars";
import { ParticipantsList, type ParticipantRow } from "@/components/ParticipantsList";

type RawRsvpRow = {
  id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_kind: "preset" | "photo";
  avatar_value: string | null;
  status: "pending" | "approved" | "restricted";
  role: "guest" | "admin" | "beneficiary";
  answer: "yes" | "maybe" | "no";
  pot_access_granted: boolean;
  wants_pot_access: boolean;
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
  isHost,
  hostProfileId,
  potEnabled,
  isBeneficiary,
  isParticipantsHidden,
  beneficiaryNames,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  isHost: boolean;
  hostProfileId: string;
  potEnabled: boolean;
  // Étape 5 du wizard (retour Thomas : "il faut rajouter dans personnes que
  // Julie a accès ou pas") : même pattern que la cagnotte/le chat -- une note
  // "X a/n'a pas accès" affichée aux AUTRES participants, jamais au(x)
  // bénéficiaire(s) concerné(s) eux-mêmes (qui voient de toute façon le
  // placeholder dédié à la place de ce composant, voir page.tsx).
  isBeneficiary: boolean;
  isParticipantsHidden: boolean;
  beneficiaryNames: string[];
}) {
  const supabase = await createClient();

  let rows: ParticipantRow[];

  if (isAdmin) {
    const { data } = await supabase
      .from("rsvps")
      .select(
        "id, profile_id, first_name, last_name, phone, avatar_kind, avatar_value, status, role, answer, pot_access_granted, wants_pot_access",
      )
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

    // Vrai compte vs session anonyme (retour Thomas : symbole visuel +
    // "Transférer l'organisation" impossible vers un admin anonyme) :
    // `auth.users` n'est pas exposée via l'API REST classique, cette
    // fonction dédiée y accède en SQL, réservée aux admins de l'événement.
    const { data: accountTypes } = await supabase.rpc("get_event_participants_account_type", {
      p_event_id: eventId,
    });
    const isAnonymousByProfile = new Map<string, boolean>();
    for (const row of accountTypes ?? []) {
      isAnonymousByProfile.set(row.profile_id, row.is_anonymous);
    }

    rows = await Promise.all(
      rsvpRows.map(async (r) => ({
        id: r.id,
        profileId: r.profile_id,
        firstName: r.first_name,
        lastName: r.last_name,
        phone: r.phone,
        avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        status: r.status,
        role: r.role,
        answer: r.answer,
        companionsCount: companionsCountByRsvp.get(r.id) ?? 0,
        potAccessGranted: r.pot_access_granted,
        wantsPotAccess: r.wants_pot_access,
        isRealAccount: isAnonymousByProfile.has(r.profile_id)
          ? !isAnonymousByProfile.get(r.profile_id)
          : null,
      })),
    );
  } else {
    // rsvps_public_data_select (RLS) inclut aussi désormais removed/left
    // (Phase 5, pour que le chat puisse résoudre "Anonyme" sur un message
    // d'un participant parti) : filtre status explicite ici pour ne garder
    // que les participants réellement approuvés dans cette liste.
    const { data } = await supabase
      .from("rsvps_public_data")
      .select("id, first_name, last_initial, avatar_kind, avatar_value, status, role, answer, companions_count")
      .eq("event_id", eventId)
      .eq("status", "approved")
      .returns<RawPublicRsvpRow[]>();

    const rsvpRows = data ?? [];
    rows = await Promise.all(
      rsvpRows.map(async (r) => ({
        id: r.id,
        profileId: null,
        firstName: r.first_name,
        lastName: r.last_initial,
        phone: null,
        avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        status: r.status,
        role: r.role,
        answer: r.answer,
        companionsCount: r.companions_count,
        potAccessGranted: false,
        wantsPotAccess: false,
        isRealAccount: null,
      })),
    );
  }

  return (
    <ParticipantsList
      eventId={eventId}
      shortCode={shortCode}
      viewerRsvpId={viewerRsvpId}
      isAdmin={isAdmin}
      isHost={isHost}
      hostProfileId={hostProfileId}
      potEnabled={potEnabled}
      rows={rows}
      isBeneficiary={isBeneficiary}
      isParticipantsHidden={isParticipantsHidden}
      beneficiaryNames={beneficiaryNames}
    />
  );
}
