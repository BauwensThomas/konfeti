"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
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
  reactions,
  replyToPreview,
  onReply,
  onOptimisticSetReaction,
}: {
  message: ChatMessageView;
  isOwnMessage: boolean;
  isAdmin: boolean;
  viewerRsvpId: string;
  showHeader: boolean;
  reactions: ChatReactionSummary[];
  replyToPreview: ChatMessageView | null;
  onReply: (message: ChatMessageView) => void;
  onOptimisticSetReaction: (messageId: string, oldEmoji: string | null, newEmoji: string | null) => void;
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

  // Position verticale de la réaction, mesurée plutôt que devinée en CSS pur
  // (retour Thomas : "si le message fait plusieurs lignes, l'émoji se
  // retrouve en bas et pas aligné avec les 3 petits points"). Le smiley/3-
  // points sont centrés (`items-center`) DANS la ligne d'icônes, qui grandit
  // avec le texte s'il fait plusieurs lignes — leur centre visuel n'est donc
  // ni en haut ni en bas de cette ligne, mais à sa moitié exacte, à une
  // hauteur qui dépend en plus de la présence ou non d'un nom/citation
  // au-dessus (variable). `offsetTop`/`offsetHeight` de la ligne d'icônes
  // (via `iconRowRef`) donnent cette position exacte par rapport au
  // conteneur `relative` racine, quel que soit ce qui se trouve au-dessus.
  const iconRowRef = useRef<HTMLDivElement>(null);
  const [reactionCenterY, setReactionCenterY] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = iconRowRef.current;
    if (!el) return;
    const measure = () => setReactionCenterY(el.offsetTop + el.offsetHeight / 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [message.body, showHeader, replyToPreview]);

  if (message.isSystem) {
    // Pas de marge ici : l'espacement (un peu d'air à l'ENTRÉE/SORTIE d'un
    // bloc système, mais rien entre plusieurs messages système consécutifs)
    // est géré par le wrapper dans `ChatRoom.tsx` (`isNewGroup`/`mt-2.5`),
    // exactement comme le regroupement des messages normaux — une marge
    // propre à ce composant s'appliquerait à CHAQUE message système, y
    // compris entre deux d'affilée, ce que Thomas ne veut justement pas.
    return (
      <p className="py-1 text-center text-xs text-foreground/50">
        {t("systemMessages.joined", { name: message.authorName ?? t("anonymousAuthor") })}
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

  return (
    <div className={`relative flex w-full gap-2 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
      {showHeader ? (
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
      )}

      <div className={`flex min-w-0 max-w-[75%] flex-col ${isOwnMessage ? "items-end" : "items-start"}`}>
        {showHeader && (
          <span className="mb-0.5 text-xs font-semibold text-foreground/60">{displayName}</span>
        )}

        {replyToPreview && (
          <div className="mb-0.5 max-w-full rounded-r-konfeti border-l-2 border-primary bg-surface py-1 pl-2 pr-3 text-xs text-foreground/60">
            <span className="font-semibold">{replyToPreview.authorName ?? t("anonymousAuthor")}</span>
            {" : "}
            <span className="line-clamp-1">{replyToPreview.body ?? "📷"}</span>
          </div>
        )}

        <div
          ref={iconRowRef}
          // Réserve un vrai espace vide (pas de recouvrement possible, contrairement
          // à un positionnement purement décoratif) du côté où flotte le cluster
          // émoji/3-points/réaction : sans ça, un texte assez long pour approcher
          // le bord opposé se retrouvait SOUS ce cluster (retour Thomas : "quand
          // on rajoute un smiley, ça passe au-dessus du texte"). Ce padding réduit
          // la largeur de renvoi à la ligne du texte lui-même (pas juste un
          // habillage visuel), donc aucun chevauchement possible quel que soit le
          // nombre de lignes. TOUJOURS la même taille, réaction ou pas (retour
          // Thomas : "le texte doit être identique avec émoji et sans émoji") —
          // une taille qui varie selon la présence d'une réaction faisait
          // reformater le texte (renvois à la ligne différents) au moment même
          // où on ajoute/retire une réaction, ce qui n'est pas voulu. Dimensionnée
          // au plus juste pour le pire cas avec réaction (retour Thomas : "il
          // doit se rapprocher du smiley" — resserré une première fois après
          // avoir vu le texte inutilement étroit). Inutile pendant l'édition
          // ET pour un message supprimé par un admin (retour Thomas : "peut
          // être sur une ligne car on ne sait plus mettre d'émoji") : le
          // cluster n'est de toute façon jamais affiché sur ces deux états
          // (voir plus bas, `!editing && !message.deletedByAdmin`), réserver
          // quand même l'espace forçait "Message supprimé..." à repasser à la
          // ligne pour rien.
          className={`flex w-full min-w-0 items-center ${
            editing || message.deletedByAdmin ? "" : isOwnMessage ? "pl-20" : "pr-20"
          }`}
        >
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
                // Même padding que la bulle reçue normale (retour Thomas :
                // "il faut resserrer ça aussi comme si c'était un message") —
                // cette bulle avait gardé l'ancien `py-2` d'avant les
                // resserrements successifs du chat, jamais mise à jour.
                <div className="rounded-konfeti bg-surface px-3 py-0.5 text-sm text-foreground">
                  <span className="italic opacity-70">{t("deletedByAdmin")}</span>
                </div>
              ) : message.photoUrl ? (
                // Pas de bulle colorée autour d'une photo (retour Thomas) :
                // juste l'image, coins arrondis, cliquable pour l'agrandir.
                <button type="button" onClick={() => setPhotoEnlarged(true)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- photo utilisateur signée */}
                  <img src={message.photoUrl} alt="" className="max-h-60 rounded-konfeti object-contain" />
                </button>
              ) : isOwnMessage ? (
                // Retour Thomas : ses propres messages ne doivent plus avoir de
                // bulle mauve, juste le texte en vert (couleur de marque
                // existante `accent-mint`, jamais utilisée dans le chat jusqu'ici).
                <div className="min-w-0 px-1 py-0 text-sm text-accent-mint">
                  <span className="whitespace-pre-line wrap-break-word">{message.body}</span>
                </div>
              ) : (
                <div className="min-w-0 rounded-konfeti bg-surface px-3 py-0.5 text-sm text-foreground">
                  <span className="whitespace-pre-line wrap-break-word">{message.body}</span>
                </div>
              )}
        </div>
      </div>

      {/* Émoji, 3-points ET réaction déjà posée : tous les trois complètement
          détachés du texte, ancrés au bord opposé (retour Thomas : "je ne
          les trouve pas alignés si j'écris un mot de 2 lettres puis un de 5
          lettres à la suite, les points ne se retrouvent pas au même
          endroit" — quand ces boutons suivaient directement le texte, leur
          position horizontale dépendait de la longueur de CHAQUE message,
          donc sautait d'une ligne à l'autre). Alignés pile sur la hauteur du
          texte (`reactionCenterY`, mesuré via `iconRowRef` sur la bulle
          elle-même, recalculé à chaque changement de texte/en-tête/citation)
          y compris pour un message multi-lignes. Position pas encore mesurée
          (premier rendu) → invisible plutôt que mal placée un instant. */}
      {!editing && !message.deletedByAdmin && (
        <div
          className={`absolute flex items-center gap-1 ${isOwnMessage ? "left-0 flex-row-reverse" : "right-0"} ${reactionCenterY === null ? "invisible" : ""}`}
          style={{ top: reactionCenterY ?? 0, transform: "translateY(-50%)" }}
        >
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

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} fitContent>
        <div className="flex min-w-32 flex-col">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onReply(message);
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
