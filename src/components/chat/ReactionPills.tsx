"use client";

import type { ChatReactionEmoji } from "@/lib/validation/chat";
import type { ChatReactionSummary } from "@/components/chat/types";

// Pastilles de réactions déjà posées sur un message (brief 4.3), affichées
// à côté du texte — pas de logique d'ouverture de picker ici, juste le
// rendu + le clic direct sur une pastille existante (une seule réaction par
// participant : cliquer pose/remplace/retire sa propre réaction, voir
// MessageBubble.handleReactionPick pour la logique exacte).
export function ReactionPills({
  reactions,
  onToggle,
  disabled,
}: {
  reactions: ChatReactionSummary[];
  onToggle: (emoji: ChatReactionEmoji) => void;
  disabled: boolean;
}) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.stickerId}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(r.stickerId as ChatReactionEmoji)}
          className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
            r.reactedByMe ? "border-primary bg-primary/10" : "border-border bg-surface"
          }`}
        >
          <span>{r.stickerId}</span>
          <span className="font-semibold text-foreground/70">{r.count}</span>
        </button>
      ))}
    </div>
  );
}
