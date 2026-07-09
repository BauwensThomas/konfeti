import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl, resolveEventPhotoUrl } from "@/lib/avatars";
import { computeUnreadCount } from "@/lib/chat/unread";
import { ChatRoom } from "@/components/chat/ChatRoom";
import type { ChatMessageView, ChatReactionSummary } from "@/components/chat/types";

type RawMessageRow = {
  id: string;
  rsvp_id: string | null;
  channel: "main" | "backstage";
  body: string | null;
  photo_url: string | null;
  reply_to: string | null;
  is_system: boolean;
  deleted_by_admin: boolean;
  created_at: string;
};

// Onglet Chat (brief 4.3) : charge les 50 derniers messages du/des
// canal(aux) visibles, résout les auteurs et les réactions en batch, calcule
// le compteur non-lus initial, puis délègue l'affichage + le temps réel à
// ChatRoom (client).
export async function EventChat({
  eventId,
  viewerRsvpId,
  isAdmin,
  isBeneficiary,
}: {
  eventId: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  isBeneficiary: boolean;
}) {
  const supabase = await createClient();

  const { data: beneficiaryRow } = await supabase
    .from("rsvps_public_data")
    .select("id")
    .eq("event_id", eventId)
    .eq("role", "beneficiary")
    .eq("status", "approved")
    .maybeSingle();
  const hasBackstage = !!beneficiaryRow;

  const visibleChannels: ("main" | "backstage")[] =
    hasBackstage && !isBeneficiary ? ["main", "backstage"] : ["main"];

  // Position de lecture au dernier passage (brief : reprendre au premier
  // message non lu, avec une ligne de séparation) : lue ici, AVANT que
  // l'ouverture de l'onglet Chat ne mette à jour `chat_reads` côté client
  // (voir EventTabs.handleTabClick) — ce composant serveur n'est reconstruit
  // qu'au prochain chargement complet de la page, donc cette valeur reste
  // celle du dernier vrai passage, jamais écrasée par la session en cours.
  const { data: readRow } = viewerRsvpId
    ? await supabase
        .from("chat_reads")
        .select("last_read_at")
        .eq("event_id", eventId)
        .eq("rsvp_id", viewerRsvpId)
        .eq("channel", "main")
        .maybeSingle()
    : { data: null };
  const initialLastReadAt = readRow?.last_read_at ?? null;

  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, rsvp_id, channel, body, photo_url, reply_to, is_system, deleted_by_admin, created_at")
    .eq("event_id", eventId)
    .in("channel", visibleChannels)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<RawMessageRow[]>();

  const rows = (messageRows ?? []).slice().reverse();

  const authorIds = [...new Set(rows.map((r) => r.rsvp_id).filter((id): id is string => !!id))];
  const authorMap = new Map<string, { name: string | null; avatarUrl: string | null }>();

  if (authorIds.length > 0) {
    if (isAdmin) {
      const { data } = await supabase
        .from("rsvps")
        .select("id, first_name, last_name, avatar_kind, avatar_value")
        .in("id", authorIds);
      for (const r of data ?? []) {
        authorMap.set(r.id, {
          name: r.first_name ? `${r.first_name} ${r.last_name ?? ""}`.trim() : null,
          avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        });
      }
    } else {
      const { data } = await supabase
        .from("rsvps_public_data")
        .select("id, first_name, last_initial, avatar_kind, avatar_value")
        .in("id", authorIds);
      for (const r of data ?? []) {
        authorMap.set(r.id, {
          name: r.first_name ? `${r.first_name} ${r.last_initial ?? ""}`.trim() : null,
          avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        });
      }
    }
  }

  const initialMessages: ChatMessageView[] = await Promise.all(
    rows.map(async (r) => {
      const author = r.rsvp_id ? (authorMap.get(r.rsvp_id) ?? { name: null, avatarUrl: null }) : { name: null, avatarUrl: null };
      return {
        id: r.id,
        channel: r.channel,
        body: r.body,
        photoUrl: await resolveEventPhotoUrl(supabase, r.photo_url),
        replyTo: r.reply_to,
        isSystem: r.is_system,
        deletedByAdmin: r.deleted_by_admin,
        createdAt: r.created_at,
        rsvpId: r.rsvp_id,
        authorName: author.name,
        authorAvatarUrl: author.avatarUrl,
      };
    }),
  );

  const messageIds = rows.map((r) => r.id);
  const initialReactions: Record<string, ChatReactionSummary[]> = {};
  if (messageIds.length > 0) {
    const { data: reactionRows } = await supabase
      .from("message_reactions")
      .select("message_id, rsvp_id, sticker_id")
      .in("message_id", messageIds);

    for (const r of reactionRows ?? []) {
      const existing = initialReactions[r.message_id] ?? [];
      const entry = existing.find((e) => e.stickerId === r.sticker_id);
      if (entry) {
        entry.count += 1;
        entry.reactedByMe = entry.reactedByMe || r.rsvp_id === viewerRsvpId;
      } else {
        existing.push({ stickerId: r.sticker_id, count: 1, reactedByMe: r.rsvp_id === viewerRsvpId });
      }
      initialReactions[r.message_id] = existing;
    }
  }

  return (
    <ChatRoom
      eventId={eventId}
      viewerRsvpId={viewerRsvpId}
      isAdmin={isAdmin}
      isBeneficiary={isBeneficiary}
      hasBackstage={hasBackstage}
      initialMessages={initialMessages}
      initialReactions={initialReactions}
      initialLastReadAt={initialLastReadAt}
    />
  );
}

// Compteur non-lus initial (canal principal uniquement, brief 4.3) : calculé
// séparément de EventChat (utilisé aussi bien depuis page.tsx, avant que le
// panneau Chat lui-même soit monté, pour la pastille sur l'onglet).
export async function getInitialUnreadCount(eventId: string, viewerRsvpId: string | null): Promise<number> {
  if (!viewerRsvpId) return 0;

  const supabase = await createClient();
  const { data: readRow } = await supabase
    .from("chat_reads")
    .select("last_read_at")
    .eq("event_id", eventId)
    .eq("rsvp_id", viewerRsvpId)
    .eq("channel", "main")
    .maybeSingle();

  let query = supabase.from("messages").select("rsvp_id").eq("event_id", eventId).eq("channel", "main");
  if (readRow?.last_read_at) {
    query = query.gt("created_at", readRow.last_read_at);
  }
  const { data } = await query;

  return computeUnreadCount((data ?? []).map((r) => ({ rsvpId: r.rsvp_id })), viewerRsvpId);
}
