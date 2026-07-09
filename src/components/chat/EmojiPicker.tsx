"use client";

import { useTranslations } from "next-intl";
import { CHAT_REACTION_EMOJIS, type ChatReactionEmoji } from "@/lib/validation/chat";

const EMOJI_LABEL_KEYS: Record<ChatReactionEmoji, string> = {
  "👍": "reactions.thumbsUp",
  "👎": "reactions.thumbsDown",
  "😢": "reactions.crying",
  "😊": "reactions.smiling",
  "🤣": "reactions.rofl",
  "😠": "reactions.angry",
  "⚠️": "reactions.warning",
  "❤️": "reactions.heart",
};

// Picker de réaction (brief 4.3) : 7 émojis réels, pas de sticker maison —
// choix explicite de Thomas pour rester simple et universellement compris.
export function EmojiPicker({ onPick }: { onPick: (emoji: ChatReactionEmoji) => void }) {
  const t = useTranslations("Chat");

  return (
    <div className="flex gap-0.5 rounded-konfeti border border-border bg-surface p-1.5 shadow-konfeti">
      {CHAT_REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          aria-label={t(EMOJI_LABEL_KEYS[emoji])}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform active:scale-90 hover:bg-primary/10"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
