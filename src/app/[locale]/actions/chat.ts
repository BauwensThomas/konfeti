"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/guest-session";
import { isRateLimited } from "@/lib/rate-limit";
import { getEventApprovedUserIds } from "@/lib/push-recipients";
import { sendPush } from "@/lib/push-send";
import { pushMessages } from "@/lib/push-messages";
import {
  sendMessageSchema,
  editMessageSchema,
  moderateDeleteMessageSchema,
  setReactionSchema,
  type SendMessageInput,
  type ChatReactionEmoji,
} from "@/lib/validation/chat";

export type ChatActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_authenticated" | "rate_limited" | "unauthorized" | "unknown" };

// L'hôte n'a jamais de ligne rsvps automatique (voir date-poll.ts). Pour un
// participant normal, une ligne existe déjà depuis son onboarding (identité
// + réponse) : `ensure_own_rsvp` (RPC déjà existant) la retourne telle
// quelle sans rien créer. Appelée paresseusement côté client, seulement si
// `viewerRsvpId` initial est `null` (cas host qui n'a encore ni voté ni
// ouvert le chat), jamais au chargement de la page.
export async function ensureMyChatRsvpId(
  eventId: string,
): Promise<{ ok: true; rsvpId: string } | { ok: false }> {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user) return { ok: false };

  const { data: rsvpId, error } = await supabase.rpc("ensure_own_rsvp", { p_event_id: eventId });
  if (error || !rsvpId) return { ok: false };

  return { ok: true, rsvpId };
}

export type SendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; error: "invalid" | "not_authenticated" | "rate_limited" | "unknown" };

// Pas de `revalidatePath` : le chat est piloté par Realtime (l'expéditeur
// voit son propre message via l'abonnement, comme tout le monde), pas par
// le cache Next — écart assumé par rapport au pattern des autres actions.
export async function sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`sendMessage:${user.id}`, 30, 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({
      event_id: data.eventId,
      rsvp_id: data.rsvpId,
      channel: data.channel,
      body: data.body ?? null,
      photo_url: data.photoUrl ?? null,
      reply_to: data.replyTo ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: "unknown" };
  }

  // L'expéditeur ne doit jamais voir son propre message compter comme
  // "non-lu" (computeUnreadCount exclut déjà les messages du viewer, ce
  // upsert garde en plus son marqueur de lecture à jour pour les prochains).
  await supabase
    .from("chat_reads")
    .upsert(
      { event_id: data.eventId, rsvp_id: data.rsvpId, channel: data.channel, last_read_at: new Date().toISOString() },
      { onConflict: "event_id,rsvp_id,channel" },
    );

  try {
    const [{ data: event }, { data: rsvp }] = await Promise.all([
      supabase.from("events").select("title, short_code").eq("id", data.eventId).single(),
      supabase.from("rsvps").select("first_name").eq("id", data.rsvpId).single(),
    ]);
    if (event) {
      const recipientUserIds = (await getEventApprovedUserIds(supabase, data.eventId, { channel: data.channel })).filter(
        (id) => id !== user.id,
      );
      void sendPush(
        recipientUserIds,
        "chat",
        pushMessages.newChatMessage(event.short_code, event.title, rsvp?.first_name ?? "Un invité", data.channel),
      );
    }
  } catch {
    // Best-effort.
  }

  return { ok: true, messageId: inserted.id };
}

// Édition de son propre message dans les 30 secondes suivant l'envoi
// (décision produit : la suppression reste réservée aux admins, voir
// moderateDeleteMessage — un auteur corrige une erreur en éditant, pas en
// supprimant). `edit_own_message` (SQL) vérifie elle-même la fenêtre de
// temps, pas seulement l'UI.
export async function editOwnMessage(messageId: string, body: string): Promise<ChatActionResult> {
  const parsed = editMessageSchema.safeParse({ messageId, body });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { error } = await supabase.rpc("edit_own_message", {
    p_message_id: parsed.data.messageId,
    p_body: parsed.data.body,
  });
  if (error) {
    return { ok: false, error: error.message.includes("expired") ? "unauthorized" : "unknown" };
  }

  return { ok: true };
}

// Seule voie de suppression d'un message, décision produit (brief 4.3) :
// réservée aux admins, y compris sur leurs propres messages. Suppression
// douce (deleted_by_admin), RLS (messages_moderate_admin) + le grant colonne
// (`deleted_by_admin` seule) font tout le travail d'autorisation, aucune
// fonction SQL dédiée nécessaire.
export async function moderateDeleteMessage(messageId: string): Promise<ChatActionResult> {
  const parsed = moderateDeleteMessageSchema.safeParse({ messageId });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { data: updated, error } = await supabase
    .from("messages")
    .update({ deleted_by_admin: true })
    .eq("id", parsed.data.messageId)
    .select("id");

  if (error) {
    return { ok: false, error: "unknown" };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "unauthorized" };
  }

  return { ok: true };
}

// Une seule réaction par participant et par message (décision produit) :
// `emoji: null` retire la réaction existante ; une valeur la pose (ou la
// remplace si le participant avait déjà réagi différemment — upsert sur la
// clé (message_id, rsvp_id), qui n'inclut plus l'emoji).
export async function setReaction(
  messageId: string,
  rsvpId: string,
  emoji: ChatReactionEmoji | null,
): Promise<ChatActionResult> {
  const parsed = setReactionSchema.safeParse({ messageId, emoji });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`setReaction:${user.id}`, 60, 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  if (parsed.data.emoji) {
    const { error } = await supabase
      .from("message_reactions")
      .upsert(
        { message_id: parsed.data.messageId, rsvp_id: rsvpId, sticker_id: parsed.data.emoji },
        { onConflict: "message_id,rsvp_id" },
      );
    if (error) return { ok: false, error: "unknown" };
  } else {
    const { error } = await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", parsed.data.messageId)
      .eq("rsvp_id", rsvpId);
    if (error) return { ok: false, error: "unknown" };
  }

  return { ok: true };
}
