import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl } from "@/lib/avatars";
import { fetchAllPages } from "@/lib/pagination";
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
  checked_in_at: string | null;
  arrived_home_at: string | null;
};

// Blocage définitif (Phase 9, retour Thomas) : identité PAS anonymisée
// (contrairement à un retrait classique) -- voir la migration dédiée.
type RawBlockedRsvpRow = {
  id: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_kind: "preset" | "photo";
  avatar_value: string | null;
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
  checked_in_at: string | null;
  arrived_home_at: string | null;
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
  autoApprove,
  isBeneficiary,
  isParticipantsHidden,
  beneficiaryNames,
  isJourJ,
  viewerIsPotOwner,
  potOwnerStripeConnected,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  isHost: boolean;
  hostProfileId: string;
  potEnabled: boolean;
  // Blocage définitif (Phase 9, retour Thomas) : le bouton "Bloquer" n'a de
  // sens que si l'événement accepte n'importe qui automatiquement (sinon la
  // file d'attente normale suffit déjà à filtrer un retour indésirable).
  autoApprove: boolean;
  // Étape 5 du wizard (retour Thomas : "il faut rajouter dans personnes que
  // Julie a accès ou pas") : même pattern que la cagnotte/le chat -- une note
  // "X a/n'a pas accès" affichée aux AUTRES participants, jamais au(x)
  // bénéficiaire(s) concerné(s) eux-mêmes (qui voient de toute façon le
  // placeholder dédié à la place de ce composant, voir page.tsx).
  isBeneficiary: boolean;
  isParticipantsHidden: boolean;
  beneficiaryNames: string[];
  // Mode Jour J (brief 4.11) : badges "Arrivé"/"Bien rentré" n'affichés que
  // ce jour-là, jamais avant (répond à "pratique pour savoir qui on attend
  // avant de lancer le gâteau").
  isJourJ: boolean;
  // Retour Thomas : "stripe ne doit être visible que par l'organisateur
  // (celui qui a fait son compte stripe)" -- même garde que la bannière
  // Accueil (`PotConnectionBannerSection.tsx`), calculée une seule fois dans
  // page.tsx plutôt que refaite ici.
  viewerIsPotOwner: boolean;
  potOwnerStripeConnected: boolean;
}) {
  const supabase = await createClient();

  let rows: ParticipantRow[];

  if (isAdmin) {
    // Pagination explicite (`fetchAllPages`) : PostgREST plafonne les lignes
    // renvoyées par requête (souvent 1000) -- seule table de cet écran qui
    // pourrait réalistement l'atteindre un jour (un très gros événement
    // ouvert), tout le reste (companions, votes...) reste borné par ce même
    // nombre de participants (retour Thomas, voir DECISIONS.md).
    const rsvpRows = await fetchAllPages<RawRsvpRow>((from, to) =>
      supabase
        .from("rsvps")
        .select(
          "id, profile_id, first_name, last_name, phone, avatar_kind, avatar_value, status, role, answer, pot_access_granted, wants_pot_access, checked_in_at, arrived_home_at",
        )
        .eq("event_id", eventId)
        .in("status", ["pending", "restricted", "approved"])
        .range(from, to)
        .returns<RawRsvpRow[]>(),
    );
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

    // Bug réel signalé par Thomas : "je vois une autre image que la
    // personne, je ne vois pas son nom ni son numéro" -- répondre "non"
    // anonymise la ligne rsvps (voir `update_my_answer`). Décision explicite
    // de Thomas (question posée directement) : un admin doit TOUJOURS voir
    // la vraie identité dans "Ne peuvent pas venir", pas seulement en cas de
    // demande d'accès cagnotte -- `profile_id` n'est lui jamais effacé,
    // seule source d'identité encore disponible. `profiles_select_own`
    // (RLS) n'autorise à lire que son PROPRE profil : client service-role
    // ici, même pattern déjà rencontré pour le statut d'onboarding Stripe.
    const restrictedProfileIds = rsvpRows.filter((r) => r.status === "restricted").map((r) => r.profile_id);
    const realIdentityByProfileId = new Map<
      string,
      { first_name: string | null; last_name: string | null; phone: string | null; avatar_kind: "preset" | "photo"; avatar_value: string | null }
    >();
    if (restrictedProfileIds.length > 0) {
      const admin = createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const { data: realProfiles } = await admin
        .from("profiles")
        .select("id, first_name, last_name, phone, avatar_kind, avatar_value")
        .in("id", restrictedProfileIds);
      for (const p of realProfiles ?? []) {
        realIdentityByProfileId.set(p.id, p);
      }
    }

    rows = await Promise.all(
      rsvpRows.map(async (r) => {
        const realIdentity = r.status === "restricted" ? realIdentityByProfileId.get(r.profile_id) : undefined;
        return {
          id: r.id,
          profileId: r.profile_id,
          firstName: realIdentity?.first_name ?? r.first_name,
          lastName: realIdentity?.last_name ?? r.last_name,
          phone: realIdentity?.phone ?? r.phone,
          avatarUrl: await resolveAvatarUrl(
            supabase,
            realIdentity?.avatar_kind ?? r.avatar_kind,
            realIdentity?.avatar_value ?? r.avatar_value,
          ),
          status: r.status,
          role: r.role,
          answer: r.answer,
          companionsCount: companionsCountByRsvp.get(r.id) ?? 0,
          potAccessGranted: r.pot_access_granted,
          wantsPotAccess: r.wants_pot_access,
          checkedInAt: r.checked_in_at,
          arrivedHomeAt: r.arrived_home_at,
          blocked: false,
        };
      }),
    );

    // Blocage définitif (Phase 9) : requête séparée -- ces lignes ont
    // `status = 'removed'`, hors du filtre `.in("status", ...)` ci-dessus.
    // Identité PAS anonymisée (voir la migration), pas besoin du repli
    // service-role utilisé pour "restricted".
    const { data: blockedData } = await supabase
      .from("rsvps")
      .select("id, profile_id, first_name, last_name, avatar_kind, avatar_value")
      .eq("event_id", eventId)
      .eq("blocked", true)
      .returns<RawBlockedRsvpRow[]>();

    const blockedRows: ParticipantRow[] = await Promise.all(
      (blockedData ?? []).map(async (r) => ({
        id: r.id,
        profileId: r.profile_id,
        firstName: r.first_name,
        lastName: r.last_name,
        phone: null,
        avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        status: "removed" as const,
        role: "guest" as const,
        answer: "yes" as const,
        companionsCount: 0,
        potAccessGranted: false,
        wantsPotAccess: false,
        checkedInAt: null,
        arrivedHomeAt: null,
        blocked: true,
      })),
    );
    rows = [...rows, ...blockedRows];
  } else {
    // rsvps_public_data_select (RLS) inclut aussi désormais removed/left
    // (Phase 5, pour que le chat puisse résoudre "Anonyme" sur un message
    // d'un participant parti) : filtre status explicite ici pour ne garder
    // que les participants réellement approuvés dans cette liste.
    const rsvpRows = await fetchAllPages<RawPublicRsvpRow>((from, to) =>
      supabase
        .from("rsvps_public_data")
        .select(
          "id, first_name, last_initial, avatar_kind, avatar_value, status, role, answer, companions_count, checked_in_at, arrived_home_at",
        )
        .eq("event_id", eventId)
        .eq("status", "approved")
        .range(from, to)
        .returns<RawPublicRsvpRow[]>(),
    );
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
        checkedInAt: r.checked_in_at,
        arrivedHomeAt: r.arrived_home_at,
        blocked: false,
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
      autoApprove={autoApprove}
      rows={rows}
      isBeneficiary={isBeneficiary}
      isParticipantsHidden={isParticipantsHidden}
      beneficiaryNames={beneficiaryNames}
      isJourJ={isJourJ}
      viewerIsPotOwner={viewerIsPotOwner}
      potOwnerStripeConnected={potOwnerStripeConnected}
    />
  );
}
