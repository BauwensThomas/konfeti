import { z } from "zod";

// Réactions (brief 4.3) : émojis réels, pas de sticker maison (décision
// produit de Thomas, plus simple et universellement compris). "Mort de
// rire" ajouté sur demande explicite de Thomas.
export const CHAT_REACTION_EMOJIS = ["👍", "👎", "😢", "😊", "🤣", "😠", "⚠️", "❤️"] as const;
export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export const sendMessageSchema = z
  .object({
    eventId: z.string().uuid(),
    rsvpId: z.string().uuid(),
    channel: z.enum(["main", "backstage"]),
    body: z.string().trim().min(1).max(2000).optional(),
    photoUrl: z.string().trim().min(1).optional(),
    replyTo: z.string().uuid().optional(),
  })
  .refine((data) => !!data.body || !!data.photoUrl, {
    message: "message_empty",
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  messageId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export const moderateDeleteMessageSchema = z.object({
  messageId: z.string().uuid(),
});

// Une seule réaction par participant et par message (décision produit) :
// `emoji: null` retire la réaction existante, une valeur la pose/remplace.
export const setReactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.enum(CHAT_REACTION_EMOJIS).nullable(),
});
