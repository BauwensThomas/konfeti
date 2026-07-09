import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

export type MessageRow = {
  id: string;
  event_id: string;
  rsvp_id: string | null;
  channel: "main" | "backstage";
  body: string | null;
  photo_url: string | null;
  reply_to: string | null;
  is_system: boolean;
  deleted_by_admin: boolean;
  created_at: string;
};

export type ReactionRow = {
  message_id: string;
  rsvp_id: string;
  sticker_id: string;
};

export type ChatRealtimeHandlers = {
  onMessageInsert?: (message: MessageRow) => void;
  onMessageUpdate?: (message: MessageRow) => void;
  onMessageDelete?: (messageId: string) => void;
  onReactionInsert?: (reaction: ReactionRow) => void;
  onReactionUpdate?: (newReaction: ReactionRow, oldReaction: ReactionRow) => void;
  onReactionDelete?: (reaction: ReactionRow) => void;
};

// Deux abonnements distincts coexistent pour un même événement : le panneau
// de chat (ChatRoom, monté seulement sur l'onglet actif) et le badge
// non-lus (EventTabs, toujours monté). `channelSuffix` évite toute
// ambiguïté entre les deux topics Realtime. `message_reactions` n'a pas de
// colonne `event_id` (pas de filtre serveur possible) : le tri par message
// pertinent se fait côté appelant (RLS limite déjà la portée réelle des
// lignes reçues à ce que l'utilisateur peut voir).
//
// Jamais de `filter: event_id=eq...` sur `messages` non plus (même piège que
// `rsvps`, voir doc/DECISIONS.md) : la pastille non-lus ne se mettait pas à
// jour en direct chez un participant resté sur un autre onglet (retour
// Thomas), reproductible uniquement dans le vrai navigateur (un script de
// test isolé avec une session déjà établie ne reproduisait pas le problème
// — piste probable : un abonnement souscrit avant la fin de la synchro
// auth->Realtime du client navigateur). Filtrage sur `event_id` fait donc
// côté client ici, une fois pour toutes les souscriptions de ce module.
export function subscribeToEventChat(
  supabase: SupabaseClient,
  eventId: string,
  handlers: ChatRealtimeHandlers,
  channelSuffix: string,
): RealtimeChannel {
  return supabase
    .channel(`event-${eventId}-chat-${channelSuffix}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      const message = payload.new as MessageRow;
      if (message.event_id === eventId) handlers.onMessageInsert?.(message);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
      const message = payload.new as MessageRow;
      if (message.event_id === eventId) handlers.onMessageUpdate?.(message);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
      // Aucune suppression physique de message en usage normal (moderation =
      // deleted_by_admin, une mise à jour) : `old` n'a de toute façon pas
      // `event_id` sans `replica identity full` sur cette table. Un id qui ne
      // correspond à rien dans la liste locale est un no-op sans risque.
      handlers.onMessageDelete?.((payload.old as { id: string }).id);
    })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "message_reactions" },
      (payload) => handlers.onReactionInsert?.(payload.new as ReactionRow),
    )
    .on(
      // Changer d'emoji (une seule réaction par participant) met à jour la
      // ligne existante plutôt que d'en créer une nouvelle : nécessite
      // `replica identity full` sur message_reactions pour que `old`
      // contienne le sticker_id précédent, pas seulement la clé primaire.
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "message_reactions" },
      (payload) => handlers.onReactionUpdate?.(payload.new as ReactionRow, payload.old as ReactionRow),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "message_reactions" },
      (payload) => handlers.onReactionDelete?.(payload.old as ReactionRow),
    )
    .subscribe();
}
