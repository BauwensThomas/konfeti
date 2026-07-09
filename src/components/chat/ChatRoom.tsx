"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ensureRealtimeAuth } from "@/lib/supabase/realtime-auth";
import { resolveAvatarUrl, resolveEventPhotoUrl } from "@/lib/avatars";
import { subscribeToEventChat, type MessageRow, type ReactionRow } from "@/lib/chat/realtime";
import { ensureMyChatRsvpId } from "@/app/[locale]/actions/chat";
import { Card } from "@/components/ui/Card";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageComposer } from "@/components/chat/MessageComposer";
import type { ChatMessageView, ChatReactionSummary } from "@/components/chat/types";

export function ChatRoom({
  eventId,
  viewerRsvpId: initialViewerRsvpId,
  isAdmin,
  isBeneficiary,
  hasBackstage,
  initialMessages,
  initialReactions,
  initialLastReadAt,
}: {
  eventId: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  isBeneficiary: boolean;
  hasBackstage: boolean;
  initialMessages: ChatMessageView[];
  initialReactions: Record<string, ChatReactionSummary[]>;
  initialLastReadAt: string | null;
}) {
  const t = useTranslations("Chat");
  const [viewerRsvpId, setViewerRsvpId] = useState(initialViewerRsvpId);
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [reactionsByMessage, setReactionsByMessage] =
    useState<Record<string, ChatReactionSummary[]>>(initialReactions);
  const [activeChannel, setActiveChannel] = useState<"main" | "backstage">("main");
  const [replyingTo, setReplyingTo] = useState<ChatMessageView | null>(null);
  const authorCacheRef = useRef(new Map<string, { name: string | null; avatarUrl: string | null }>());
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrolledToUnreadRef = useRef(false);

  // Position de lecture au premier message non lu (brief), figée une seule
  // fois : ne dépend jamais des messages arrivant ensuite en temps réel, ni
  // de la mise à jour de `chat_reads` déclenchée par l'ouverture même de cet
  // onglet (voir EventTabs.handleTabClick). Calculée dans l'effet de
  // rattrapage ci-dessous (pas ici, à partir de `initialMessages`) : ce
  // dernier peut être périmé (un message reçu entre le dernier vrai
  // chargement de page et l'ouverture de cet onglet — voir ce même effet —
  // n'y figure pas encore), ce qui faisait disparaître la ligne "non lus"
  // dès que le message réellement non lu n'était connu que du rattrapage
  // (retour Thomas : "je ne vois plus la ligne rouge").
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);

  const showBackstageToggle = hasBackstage && !isBeneficiary;

  // L'hôte n'a pas forcément de ligne rsvps tant qu'il n'a jamais voté/écrit
  // (voir date-poll.ts) : on la crée/récupère paresseusement au premier
  // montage du panneau plutôt qu'au chargement de la page.
  useEffect(() => {
    if (viewerRsvpId) return;
    ensureMyChatRsvpId(eventId).then((result) => {
      if (result.ok) setViewerRsvpId(result.rsvpId);
    });
  }, [eventId, viewerRsvpId]);

  // Extrait de l'effet Realtime pour être réutilisable par le rattrapage
  // ci-dessous (les deux ont besoin de résoudre l'auteur d'une ligne brute).
  const resolveAuthor = useCallback(
    async (supabase: ReturnType<typeof createClient>, rsvpId: string) => {
      if (authorCacheRef.current.has(rsvpId)) return authorCacheRef.current.get(rsvpId)!;
      const table = isAdmin ? "rsvps" : "rsvps_public_data";
      const nameColumn = isAdmin ? "last_name" : "last_initial";
      const { data } = await supabase
        .from(table)
        .select(`first_name, ${nameColumn}, avatar_kind, avatar_value`)
        .eq("id", rsvpId)
        .maybeSingle<{
          first_name: string | null;
          avatar_kind: "preset" | "photo";
          avatar_value: string | null;
          [key: string]: unknown;
        }>();
      if (!data) return { name: null, avatarUrl: null };
      const lastPart = (data[nameColumn] as string | null) ?? "";
      const name = data.first_name ? `${data.first_name} ${lastPart}`.trim() : null;
      const avatarUrl = await resolveAvatarUrl(supabase, data.avatar_kind, data.avatar_value);
      const resolved = { name, avatarUrl };
      authorCacheRef.current.set(rsvpId, resolved);
      return resolved;
    },
    [isAdmin],
  );

  // Rattrapage au montage : ce panneau se démonte/remonte à chaque
  // changement d'onglet (voir EventTabs), donc un message envoyé pendant
  // qu'il n'était PAS monté n'arrive ni via `initialMessages` (figé au
  // dernier vrai chargement de page) ni via Realtime (jamais rejoué après
  // coup) — seule la pastille non-lus le savait. Retour Thomas : "la bulle
  // vient, mais le message ne vient pas, je suis obligé de refresh". Une
  // requête directe à l'ouverture comble ce trou, fusionnée par id (les
  // données fraîches gagnent, ce qui couvre aussi une édition/suppression
  // manquée entre-temps).
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const { data: rows } = await supabase
        .from("messages")
        .select("id, rsvp_id, channel, body, photo_url, reply_to, is_system, deleted_by_admin, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<MessageRow[]>();
      if (cancelled || !rows) return;

      const resolved = await Promise.all(
        rows
          .slice()
          .reverse()
          .map(async (row) => {
            const [author, photoUrl] = await Promise.all([
              row.rsvp_id ? resolveAuthor(supabase, row.rsvp_id) : Promise.resolve({ name: null, avatarUrl: null }),
              resolveEventPhotoUrl(supabase, row.photo_url),
            ]);
            return rowToView(row, author, photoUrl);
          }),
      );
      if (cancelled) return;

      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of resolved) byId.set(m.id, m);
        return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });

      // Même trou que pour les messages (voir plus haut) : une réaction
      // posée/retirée pendant que ce panneau n'était PAS monté n'était captée
      // ni par `initialReactions` (figé au dernier vrai chargement de page)
      // ni par Realtime (jamais rejoué après coup, et de toute façon
      // désabonné hors de cet onglet) — retour Thomas : "si l'un est sur
      // accueil et que je mets un smiley sur son message, pas de refresh
      // automatique". Reconstruit l'état réel des réactions pour tous les
      // messages de cette fenêtre de rattrapage.
      const messageIds = resolved.map((m) => m.id);
      if (messageIds.length > 0) {
        const { data: reactionRows } = await supabase
          .from("message_reactions")
          .select("message_id, rsvp_id, sticker_id")
          .in("message_id", messageIds);
        if (!cancelled) {
          const byMessage = new Map<string, ChatReactionSummary[]>();
          for (const r of reactionRows ?? []) {
            const list = byMessage.get(r.message_id) ?? [];
            const existing = list.find((e) => e.stickerId === r.sticker_id);
            if (existing) {
              existing.count += 1;
              existing.reactedByMe = existing.reactedByMe || r.rsvp_id === initialViewerRsvpId;
            } else {
              list.push({ stickerId: r.sticker_id, count: 1, reactedByMe: r.rsvp_id === initialViewerRsvpId });
            }
            byMessage.set(r.message_id, list);
          }
          setReactionsByMessage((prev) => {
            const next = { ...prev };
            for (const id of messageIds) next[id] = byMessage.get(id) ?? [];
            return next;
          });
        }
      }

      // `initialLastReadAt` vaut `null` tant que ce participant n'a jamais
      // ouvert le chat au moins une fois (aucune ligne `chat_reads` encore
      // créée) : loin d'être rare, c'est le cas le plus courant en test
      // (nouveau compte). Traité comme "rien lu du tout" (chaîne vide, plus
      // petite que n'importe quelle date ISO réelle) plutôt que d'annuler la
      // fonctionnalité, sinon la ligne ne s'affichait quasiment jamais.
      const unread = resolved.find(
        (m) =>
          m.channel === "main" &&
          !m.isSystem &&
          m.rsvpId !== initialViewerRsvpId &&
          m.createdAt > (initialLastReadAt ?? ""),
      );
      setFirstUnreadId(unread?.id ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, resolveAuthor, initialLastReadAt, initialViewerRsvpId]);

  useEffect(() => {
    const supabase = createClient();

    async function handleInsert(row: MessageRow) {
      const [author, photoUrl] = await Promise.all([
        row.rsvp_id ? resolveAuthor(supabase, row.rsvp_id) : Promise.resolve({ name: null, avatarUrl: null }),
        resolveEventPhotoUrl(supabase, row.photo_url),
      ]);
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, rowToView(row, author, photoUrl)];
      });

      // Ce panneau n'existe que sur l'onglet Chat actif (voir EventTabs) :
      // tout message reçu ici est donc forcément déjà vu, pas seulement celui
      // présent au moment du clic sur l'onglet (qui seul mettait à jour
      // `chat_reads` jusqu'ici). Sans ça, un message arrivé APRÈS ce clic
      // mais PENDANT que le chat reste ouvert repassait pour non-lu au
      // prochain F5 (retour Thomas : "ça sert à rien de voir une notif d'un
      // message déjà vu").
      if (row.channel === "main" && row.rsvp_id !== viewerRsvpId && viewerRsvpId) {
        await supabase
          .from("chat_reads")
          .upsert(
            { event_id: eventId, rsvp_id: viewerRsvpId, channel: "main", last_read_at: new Date().toISOString() },
            { onConflict: "event_id,rsvp_id,channel" },
          );
      }
    }

    // Couvre à la fois la modération (deleted_by_admin) et l'édition d'un
    // message par son auteur (body/photo_url) : ce handler ne mettait avant
    // à jour que `deletedByAdmin`, donc une édition n'apparaissait chez
    // personne (pas même l'auteur) sans rechargement complet de la page
    // (retour Thomas). `photo_url` est toujours mis à `null` par
    // `edit_own_message` (voir la migration) : un message édité redevient du
    // texte pur, jamais besoin de re-résoudre une URL signée ici.
    async function handleUpdate(row: MessageRow) {
      const photoUrl = row.photo_url ? await resolveEventPhotoUrl(supabase, row.photo_url) : null;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === row.id
            ? { ...m, body: row.body, photoUrl, deletedByAdmin: row.deleted_by_admin }
            : m,
        ),
      );
    }

    function handleDelete(messageId: string) {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }

    // Les changements du viewer lui-même sont déjà reflétés par la mise à
    // jour optimiste (handleOptimisticSetReaction) : les ignorer ici évite
    // de compter deux fois le même changement quand l'écho Realtime de sa
    // propre écriture revient.
    function handleReactionInsert(reaction: ReactionRow) {
      if (reaction.rsvp_id === viewerRsvpId) return;
      setReactionsByMessage((prev) =>
        applyReactionChange(prev, reaction.message_id, reaction.rsvp_id, viewerRsvpId, null, reaction.sticker_id),
      );
    }

    // Bug réel trouvé aux frames WebSocket brutes (retour Thomas : "si je
    // retire l'émoji, il ne disparaît pas automatiquement") : le payload
    // Realtime `old`/`old_record` d'un DELETE (et pareillement de la partie
    // "avant" d'un UPDATE) sur `message_reactions` ne contient QUE la clé
    // primaire (`message_id`, `rsvp_id`) — jamais `sticker_id`, MALGRÉ
    // `replica identity full` posé sur cette table (confirmé en base via
    // `relreplident`). Sans `sticker_id`, impossible de savoir quelle
    // pastille décrémenter : `applyReactionChange` ne retirait donc jamais
    // rien pour les AUTRES participants. Contournement : ne plus faire
    // confiance au contenu du payload pour ces deux cas, requête ciblée des
    // réactions réelles de ce message pour reconstruire l'état local au lieu
    // d'un ajustement incrémental — l'INSERT, lui, contient bien toutes les
    // colonnes (c'est toujours `new`, jamais affecté par ce piège).
    async function refetchReactionsForMessage(messageId: string) {
      const { data } = await supabase
        .from("message_reactions")
        .select("rsvp_id, sticker_id")
        .eq("message_id", messageId);
      const grouped = new Map<string, ChatReactionSummary>();
      for (const r of data ?? []) {
        const existing = grouped.get(r.sticker_id);
        if (existing) {
          existing.count += 1;
          existing.reactedByMe = existing.reactedByMe || r.rsvp_id === viewerRsvpId;
        } else {
          grouped.set(r.sticker_id, { stickerId: r.sticker_id, count: 1, reactedByMe: r.rsvp_id === viewerRsvpId });
        }
      }
      setReactionsByMessage((prev) => ({ ...prev, [messageId]: Array.from(grouped.values()) }));
    }

    function handleReactionUpdate(newReaction: ReactionRow) {
      if (newReaction.rsvp_id === viewerRsvpId) return;
      refetchReactionsForMessage(newReaction.message_id);
    }

    function handleReactionDelete(reaction: ReactionRow) {
      if (reaction.rsvp_id === viewerRsvpId) return;
      refetchReactionsForMessage(reaction.message_id);
    }

    let cancelled = false;
    let channel: ReturnType<typeof subscribeToEventChat> | null = null;

    // `ensureRealtimeAuth` avant de créer le canal (même piège que la
    // pastille non-lus dans EventTabs.tsx, voir ce fichier pour le détail) :
    // même si ce panneau monte plus tard (au clic sur l'onglet Chat), donc
    // moins exposé, mieux vaut le garantir partout plutôt que de re-découvrir
    // ce même bug un jour dans un contexte de montage plus précoce.
    ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      channel = subscribeToEventChat(
        supabase,
        eventId,
        {
          onMessageInsert: handleInsert,
          onMessageUpdate: handleUpdate,
          onMessageDelete: handleDelete,
          onReactionInsert: handleReactionInsert,
          onReactionUpdate: handleReactionUpdate,
          onReactionDelete: handleReactionDelete,
        },
        "room",
      );
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // Resouscrit si viewerRsvpId change (host : passe de null à un id
    // résolu au premier montage) : sinon le guard "c'est mon propre écho"
    // dans handleReactionInsert/Delete resterait bloqué sur une valeur
    // obsolète (null) pour le reste de la session.
  }, [eventId, isAdmin, viewerRsvpId, resolveAuthor]);

  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const visibleMessages = messages.filter((m) => m.channel === activeChannel);

  useEffect(() => {
    if (!scrolledToUnreadRef.current && firstUnreadId && activeChannel === "main") {
      const unreadEl = listRef.current?.querySelector(`[data-message-id="${firstUnreadId}"]`);
      if (unreadEl) {
        scrolledToUnreadRef.current = true;
        unreadEl.scrollIntoView({ block: "start" });
        return;
      }
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visibleMessages.length, activeChannel, firstUnreadId]);

  function handleOptimisticSetReaction(messageId: string, oldEmoji: string | null, newEmoji: string | null) {
    if (!viewerRsvpId) return;
    setReactionsByMessage((prev) =>
      applyReactionChange(prev, messageId, viewerRsvpId, viewerRsvpId, oldEmoji, newEmoji),
    );
  }

  return (
    <Card className="flex h-[70vh] flex-col gap-3">
      {showBackstageToggle && (
        <div className="flex rounded-full bg-surface p-1 shadow-konfeti">
          {(["main", "backstage"] as const).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setActiveChannel(ch)}
              className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                activeChannel === ch ? "bg-primary text-white" : "text-foreground/70"
              }`}
            >
              {t(ch === "main" ? "tabs.main" : "tabs.backstage")}
            </button>
          ))}
        </div>
      )}

      {/* `-mx-6` annule le padding horizontal hérité de `Card` (p-6) pour que
          cette liste s'étende jusqu'aux bords réels du cadre blanc : la
          barre de défilement native (rendue à l'extrémité droite de la boîte
          scrollable) se retrouve alors collée au bord (retour Thomas), et un
          `px-2` plus modeste ramène les avatars/bulles "presque collés" aux
          bords plutôt que collés à 24px comme avant, sans les faire chevaucher
          les coins arrondis de la carte. */}
      <div
        ref={listRef}
        className="-mx-6 flex flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden px-2"
      >
        {visibleMessages.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground/60">{t("emptyState")}</p>
        ) : (
          visibleMessages.map((message, index) => {
            if (!viewerRsvpId) return null;
            const previous = visibleMessages[index - 1];
            const isUnreadStart = message.id === firstUnreadId;
            // Regroupe les messages consécutifs du même auteur (comme
            // WhatsApp/Messenger) : nom + avatar ne se répètent pas à chaque
            // ligne, seulement au premier message d'une série — gain d'espace
            // vertical direct (retour Thomas : "il y a trop d'espace").
            // Toujours réaffiché juste après la ligne "non lus", pour ne pas
            // perdre le repère de qui parle à la reprise de lecture.
            const previousIsSystem = previous?.isSystem ?? false;
            const showHeader =
              !message.isSystem &&
              (isUnreadStart || !previous || previousIsSystem || previous.rsvpId !== message.rsvpId);
            // Séparation visible seulement entre deux groupes différents :
            // deux expéditeurs différents, OU une transition message normal
            // ↔ message système. Des messages système consécutifs (retour
            // Thomas : plusieurs "X a rejoint la fête" d'affilée, typique des
            // tests répétés de quitter/revenir) restent collés entre eux —
            // seule l'ENTRÉE dans un bloc système (ou la sortie) mérite un
            // peu d'air, jamais l'intérieur d'un bloc déjà homogène.
            const isNewGroup =
              index > 0 &&
              (isUnreadStart ||
                message.isSystem !== previousIsSystem ||
                (!message.isSystem && previous.rsvpId !== message.rsvpId));
            return (
              <div
                key={message.id}
                data-message-id={message.id}
                className={`flex flex-col gap-1.5 ${isNewGroup ? "mt-2.5" : ""}`}
              >
                {isUnreadStart && (
                  <div className="flex items-center gap-2 py-1 text-xs font-semibold text-accent-coral">
                    <span className="h-px flex-1 bg-accent-coral/40" />
                    {t("unreadDivider")}
                    <span className="h-px flex-1 bg-accent-coral/40" />
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isOwnMessage={message.rsvpId === viewerRsvpId}
                  isAdmin={isAdmin}
                  viewerRsvpId={viewerRsvpId}
                  showHeader={showHeader}
                  reactions={reactionsByMessage[message.id] ?? []}
                  replyToPreview={message.replyTo ? (messagesById.get(message.replyTo) ?? null) : null}
                  onReply={setReplyingTo}
                  onOptimisticSetReaction={handleOptimisticSetReaction}
                />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {viewerRsvpId && (
        <MessageComposer
          key={activeChannel}
          eventId={eventId}
          rsvpId={viewerRsvpId}
          channel={activeChannel}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      )}
    </Card>
  );
}

function rowToView(
  row: MessageRow,
  author: { name: string | null; avatarUrl: string | null },
  photoUrl: string | null,
): ChatMessageView {
  return {
    id: row.id,
    channel: row.channel,
    body: row.body,
    photoUrl,
    replyTo: row.reply_to,
    isSystem: row.is_system,
    deletedByAdmin: row.deleted_by_admin,
    createdAt: row.created_at,
    rsvpId: row.rsvp_id,
    authorName: author.name,
    authorAvatarUrl: author.avatarUrl,
  };
}

// Une seule réaction par participant (décision produit) : `oldEmoji`/
// `newEmoji` décrivent la transition pour ce `rsvpId` sur ce message (pose,
// retrait, ou changement d'emoji), jamais un simple +1/-1 indépendant par
// emoji — sinon un changement d'avis compterait deux réactions du même
// participant en même temps.
function applyReactionChange(
  current: Record<string, ChatReactionSummary[]>,
  messageId: string,
  rsvpId: string,
  viewerRsvpId: string | null,
  oldEmoji: string | null,
  newEmoji: string | null,
): Record<string, ChatReactionSummary[]> {
  let list = current[messageId] ?? [];
  const isMine = rsvpId === viewerRsvpId;

  if (oldEmoji) {
    list = list
      .map((r) =>
        r.stickerId === oldEmoji
          ? { ...r, count: r.count - 1, reactedByMe: isMine ? false : r.reactedByMe }
          : r,
      )
      .filter((r) => r.count > 0);
  }

  if (newEmoji) {
    const index = list.findIndex((r) => r.stickerId === newEmoji);
    if (index === -1) {
      list = [...list, { stickerId: newEmoji, count: 1, reactedByMe: isMine }];
    } else {
      list = list.map((r, i) =>
        i === index ? { ...r, count: r.count + 1, reactedByMe: r.reactedByMe || isMine } : r,
      );
    }
  }

  return { ...current, [messageId]: list };
}
