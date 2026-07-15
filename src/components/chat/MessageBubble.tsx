"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { editOwnMessage, moderateDeleteMessage, setReaction } from "@/app/[locale]/actions/chat";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ReactionPills } from "@/components/chat/ReactionPills";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import type { ChatReactionEmoji } from "@/lib/validation/chat";
import type { ChatMessageView, ChatReactionSummary } from "@/components/chat/types";

const EDIT_WINDOW_MS = 30_000;

export function MessageBubble({
  message,
  isOwnMessage,
  isAdmin,
  viewerRsvpId,
  showHeader,
  isHighlighted,
  reactions,
  replyToPreview,
  onReply,
  onOptimisticSetReaction,
  onJumpToMessage,
}: {
  message: ChatMessageView;
  isOwnMessage: boolean;
  isAdmin: boolean;
  viewerRsvpId: string;
  showHeader: boolean;
  isHighlighted: boolean;
  reactions: ChatReactionSummary[];
  replyToPreview: ChatMessageView | null;
  onReply: (message: ChatMessageView) => void;
  onOptimisticSetReaction: (messageId: string, oldEmoji: string | null, newEmoji: string | null) => void;
  onJumpToMessage: (messageId: string) => void;
}) {
  const t = useTranslations("Chat");
  const [isPending, startTransition] = useTransition();
  const [confirmingModerate, setConfirmingModerate] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photoEnlarged, setPhotoEnlarged] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.body ?? "");
  const [editError, setEditError] = useState<string | null>(null);
  // Répondre/Modifier/Supprimer vivent dans un petit menu (3 points), à côté
  // du déclencheur de réaction, plutôt qu'une ligne toujours visible sous
  // CHAQUE message — c'était la principale source de "trop d'espace" sur les
  // messages reçus, qui s'enchaînent (retour Thomas).
  const [menuOpen, setMenuOpen] = useState(false);

  // L'auteur peut corriger son message dans les 30 secondes qui suivent
  // l'envoi (décision produit : la suppression reste réservée aux admins).
  // Un seul timeout auto-annulé referme la fenêtre au bon moment, sans
  // sonder en continu.
  const [withinEditWindow, setWithinEditWindow] = useState(
    () => Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS,
  );
  useEffect(() => {
    if (!withinEditWindow) return;
    // setTimeout même pour une fenêtre déjà expirée (délai 0) : jamais
    // d'appel direct à setState dans le corps de l'effet.
    const remaining = Math.max(
      0,
      EDIT_WINDOW_MS - (Date.now() - new Date(message.createdAt).getTime()),
    );
    const timer = setTimeout(() => setWithinEditWindow(false), remaining);
    return () => clearTimeout(timer);
  }, [message.createdAt, withinEditWindow]);

  if (message.isSystem) {
    // Pas de marge ici : l'espacement (un peu d'air à l'ENTRÉE/SORTIE d'un
    // bloc système, mais rien entre plusieurs messages système consécutifs)
    // est géré par le wrapper dans `ChatRoom.tsx` (`isNewGroup`/`mt-2.5`),
    // exactement comme le regroupement des messages normaux — une marge
    // propre à ce composant s'appliquerait à CHAQUE message système, y
    // compris entre deux d'affilée, ce que Thomas ne veut justement pas.
    // Retour Thomas : "je veux juste 1x elle a rejoint et si elle quitte X a
    // quitté" -- nom FIGÉ au moment de l'événement (`systemAuthorName`,
    // jamais `authorName` qui lui se recalcule en direct et deviendrait
    // "Anonyme" après un départ). `body` distingue "joined"/"left".
    return (
      <p className="py-1 text-center text-xs text-foreground/50">
        {t(`systemMessages.${message.body === "left" ? "left" : "joined"}`, {
          name: message.systemAuthorName || t("anonymousAuthor"),
        })}
      </p>
    );
  }

  const displayName = message.authorName ?? t("anonymousAuthor");
  // Une seule réaction par participant (décision produit) : cliquer sur son
  // propre emoji le retire, cliquer sur un autre le remplace.
  const myCurrentReaction = reactions.find((r) => r.reactedByMe)?.stickerId ?? null;

  function handleReactionPick(emoji: ChatReactionEmoji) {
    const newEmoji = myCurrentReaction === emoji ? null : emoji;
    onOptimisticSetReaction(message.id, myCurrentReaction, newEmoji);
    setPickerOpen(false);
    startTransition(async () => {
      await setReaction(message.id, viewerRsvpId, newEmoji);
    });
  }

  function handleSaveEdit() {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    setEditError(null);
    startTransition(async () => {
      const result = await editOwnMessage(message.id, trimmed);
      if (result.ok) {
        setEditing(false);
      } else {
        setEditError(t("sendError"));
      }
    });
  }

  // Date + heure (retour Thomas : "il faut aussi la date à côté de l'heure")
  // -- format numérique compact (`10/07`), pas le format long ("10 juillet")
  // déjà utilisé ailleurs sur la page événement : une bulle de chat est
  // beaucoup plus étroite qu'un en-tête de page, la compacité prime ici.
  const createdAtDate = new Date(message.createdAt);
  const time = `${createdAtDate.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" })} ${createdAtDate.toLocaleTimeString(
    "fr-BE",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
  const isSending = message.status === "sending";

  return (
    <div className={`flex w-full gap-2 ${isOwnMessage ? "justify-end" : ""}`}>
      {!isOwnMessage &&
        (showHeader ? (
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
            {message.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar déjà résolu (preset local ou photo signée)
              <img src={message.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <AvatarPlaceholder className="h-full w-full rounded-full" compact />
            )}
          </div>
        ) : (
          // Simple réservation de LARGEUR (alignement avec la colonne avatar),
          // sans hauteur fixe : un vrai avatar (h-8 = 32px) forçait la ligne
          // entière à 32px même une fois masqué (`invisible` garde ses
          // dimensions), gonflant chaque message d'un groupe déjà compact
          // (retour Thomas : "encore plus collé").
          <div className="w-8 shrink-0" />
        ))}

      <div className={`flex min-w-0 max-w-[75%] flex-col gap-1 ${isOwnMessage ? "items-end" : "items-start"}`}>
        {showHeader && (
          <span className="text-xs font-semibold text-foreground/60">{displayName}</span>
        )}

        {replyToPreview && (
          // Cliquable : ramène directement à la hauteur du message cité,
          // avec un contour orange clignotant 5 secondes pour le repérer
          // (retour Thomas) -- voir ChatRoom.scrollToAndHighlight.
          <button
            type="button"
            onClick={() => onJumpToMessage(replyToPreview.id)}
            className="max-w-full rounded-r-konfeti border-l-2 border-primary bg-surface py-1 pl-2 pr-3 text-left text-xs text-foreground/60 hover:bg-primary/10"
          >
            <span className="font-semibold">{replyToPreview.authorName ?? t("anonymousAuthor")}</span>
            {" : "}
            <span className="line-clamp-1">{replyToPreview.body ?? "📷"}</span>
          </button>
        )}

        {editing ? (
          <div className="flex w-full flex-col gap-1">
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={2}
              className="w-full rounded-konfeti border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            {editError && <p className="text-xs text-accent-coral">{editError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isPending || !editValue.trim()}
                className="text-xs font-semibold text-primary disabled:opacity-50"
              >
                {t("editSave")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditValue(message.body ?? "");
                }}
                className="text-xs font-semibold text-foreground/60"
              >
                {t("editCancel")}
              </button>
            </div>
          </div>
        ) : message.deletedByAdmin ? (
          <div
            className={`rounded-konfeti bg-surface px-3 py-2 text-sm text-foreground ${
              isHighlighted ? "chat-highlight" : ""
            }`}
          >
            <span className="italic opacity-70">{t("deletedByAdmin")}</span>
          </div>
        ) : message.photoUrl ? (
          // Pas de bulle colorée autour d'une photo (comme avant) : juste
          // l'image, coins arrondis, cliquable pour l'agrandir.
          <button
            type="button"
            onClick={() => setPhotoEnlarged(true)}
            className={isHighlighted ? "chat-highlight rounded-konfeti" : ""}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- photo utilisateur signée */}
            <img src={message.photoUrl} alt="" className="max-h-60 rounded-konfeti object-contain" />
          </button>
        ) : (
          // Vraies bulles pleines des deux côtés (retour Thomas : "je trouve
          // le design du chat horrible... j'aimerais qu'il ressemble à un
          // chat professionnel"). Avant, la bulle reçue utilisait `bg-surface`
          // -- exactement la même couleur que le `Card` qui la contenait --
          // donc invisible à l'œil ; et les messages envoyés n'avaient aucune
          // bulle du tout, juste du texte vert (un choix fait plus tôt dans
          // le projet, explicitement inversé ici par Thomas). Violet plein
          // (`bg-primary`, déjà la couleur de toute action dans l'app) pour
          // ses propres messages, blanc (`bg-surface`) pour les autres --
          // redevient visible car le fond de la zone de chat est maintenant
          // gris clair (`bg-canvas`, voir ChatRoom), pas blanc. L'heure est
          // intégrée dans la bulle (comme WhatsApp), jamais une ligne séparée
          // qui alourdirait chaque message.
          <div
            className={`flex max-w-full flex-col gap-0.5 rounded-konfeti px-3 py-2 text-sm ${
              isOwnMessage ? "bg-primary text-white" : "bg-surface text-foreground"
            } ${isSending ? "opacity-60" : ""} ${isHighlighted ? "chat-highlight" : ""}`}
          >
            <span className="whitespace-pre-line wrap-break-word">{message.body}</span>
            <span
              className={`self-end text-[10px] leading-none ${
                isOwnMessage ? "text-white/70" : "text-foreground/45"
              }`}
            >
              {isSending ? t("sending") : time}
            </span>
          </div>
        )}

        {/* Réactions + smiley + 3-points : une simple ligne sous la bulle,
            plus de positionnement absolu mesuré en JS (`ResizeObserver`) --
            ça ne peut structurellement plus chevaucher le texte, donc plus
            besoin non plus du padding de réserve qui existait pour ça.
            Masqué pendant l'envoi optimiste : l'id temporaire de cette bulle
            n'est pas encore un vrai id de message, réagir/répondre dessus
            n'aurait pas de sens tant que le serveur n'a pas confirmé. */}
        {!editing && !message.deletedByAdmin && !isSending && (
          <div className={`flex items-center gap-1 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
            {reactions.length > 0 && (
              <ReactionPills reactions={reactions} onToggle={handleReactionPick} disabled={isPending} />
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label={t("addReaction")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/40 hover:bg-primary/10 hover:text-foreground/70"
            >
              <SmileyIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t("moreActions")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/40 hover:bg-primary/10 hover:text-foreground/70"
            >
              <MoreIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} fitContent>
        <div className="flex min-w-32 flex-col">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onReply(message);
              // Synchrone, dans ce même clic (voir le commentaire sur l'id
              // dans MessageComposer.tsx) : passer par un `useEffect` déclenché
              // par le changement de `replyingTo` marcherait pour le focus
              // "logique", mais pas pour ouvrir le clavier virtuel sur mobile.
              document.getElementById("chat-message-input")?.focus();
            }}
            className="rounded-konfeti px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-primary/10"
          >
            {t("reply")}
          </button>
          {isOwnMessage && withinEditWindow && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
              className="rounded-konfeti px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-primary/10"
            >
              {t("editStart")}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmingModerate(true);
              }}
              className="rounded-konfeti px-3 py-2 text-left text-sm font-semibold text-accent-coral hover:bg-accent-coral/10"
            >
              {t("moderate")}
            </button>
          )}
        </div>
      </Modal>

      <Modal open={confirmingModerate} onClose={() => setConfirmingModerate(false)}>
        <p className="text-center text-base text-foreground">{t("moderateConfirmTitle")}</p>
        <div className="flex justify-center gap-3">
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await moderateDeleteMessage(message.id);
                setConfirmingModerate(false);
              })
            }
          >
            {t("moderateConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingModerate(false)}>
            {t("moderateConfirmNo")}
          </Button>
        </div>
      </Modal>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} fitContent>
        <EmojiPicker onPick={handleReactionPick} />
      </Modal>

      {message.photoUrl && (
        <Modal open={photoEnlarged} onClose={() => setPhotoEnlarged(false)} className="max-w-2xl p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- photo utilisateur signée, agrandie au clic */}
          <img src={message.photoUrl} alt="" className="max-h-[80vh] w-full rounded-konfeti object-contain" />
        </Modal>
      )}
    </div>
  );
}

// Icône trait simple (noir et blanc, pas un emoji réel) : cohérent avec le
// reste des boutons d'action de l'app.
function SmileyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
      <circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// 3 points verticaux (menu Répondre/Modifier/Supprimer), jamais un emoji.
function MoreIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} role="img" aria-hidden="true">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
