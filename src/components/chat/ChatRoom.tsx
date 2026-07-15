"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { ensureRealtimeAuth } from "@/lib/supabase/realtime-auth";
import { resolveAvatarUrl, resolveEventPhotoUrl } from "@/lib/avatars";
import { subscribeToEventChat, type MessageRow, type ReactionRow } from "@/lib/chat/realtime";
import { ensureMyChatRsvpId } from "@/app/[locale]/actions/chat";
import { readSessionLastReadAt, writeSessionLastReadAt } from "@/lib/chat/lastRead";
import { joinNames } from "@/lib/joinNames";
import { ChatConfettiBackground } from "@/components/chat/ChatConfettiBackground";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageComposer } from "@/components/chat/MessageComposer";
import type { ChatMessageView, ChatReactionSummary } from "@/components/chat/types";

export function ChatRoom({
  eventId,
  viewerRsvpId: initialViewerRsvpId,
  isAdmin,
  hideBackstageForViewer,
  isBackstageHiddenForBeneficiaries,
  backstageBeneficiaryNames,
  hideMainForViewer,
  isChatHiddenForBeneficiaries,
  chatBeneficiaryNames,
  initialMessages,
  initialReactions,
  initialLastReadAt,
  initialBackstageLastReadAt,
}: {
  eventId: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  // Étape 5 du wizard (retour Thomas : "s'il clique sur coulisses, il faut
  // dire vous avez pas accès") : true si CE viewer est le bénéficiaire
  // concerné par le masquage Coulisses -- remplace le contenu de CET onglet
  // par un placeholder, jamais tout le panneau (Général reste normal).
  hideBackstageForViewer: boolean;
  // Réglage BRUT de l'événement (pas filtré par viewer), pour choisir le
  // bon texte de bannière ("a accès" / "n'a pas accès" -- retour Thomas :
  // "il faut le dire quand X a accès et aussi quand elle a pas accès",
  // jamais silencieux dans un sens comme dans l'autre).
  isBackstageHiddenForBeneficiaries: boolean;
  // Prénoms des bénéficiaires approuvés, pour la bannière au-dessus de
  // Coulisses -- vide seulement s'il n'y a aucun bénéficiaire, ou si CE
  // viewer EST lui-même le bénéficiaire concerné (voir EventChat).
  backstageBeneficiaryNames: string[];
  // Symétrique de hideBackstageForViewer/isBackstageHiddenForBeneficiaries/
  // backstageBeneficiaryNames, mais pour le canal Général (bloc 'chat',
  // ajouté après coup -- retour Thomas : un bénéficiaire masqué de la liste
  // Personnes restait quand même visible comme auteur de messages dans le
  // chat général).
  hideMainForViewer: boolean;
  isChatHiddenForBeneficiaries: boolean;
  chatBeneficiaryNames: string[];
  initialMessages: ChatMessageView[];
  initialReactions: Record<string, ChatReactionSummary[]>;
  initialLastReadAt: string | null;
  // Symétrique de `initialLastReadAt`, mais pour Coulisses -- sert UNIQUEMENT
  // au compteur non-lus par onglet (retour Thomas : "mettre le nombre de
  // notif dans général et/ou coulisses"), jamais à la ligne "non lus" (qui
  // reste volontairement limitée au canal Général, voir `firstUnreadId`).
  initialBackstageLastReadAt: string | null;
}) {
  const t = useTranslations("Chat");
  const [viewerRsvpId, setViewerRsvpId] = useState(initialViewerRsvpId);
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  // Bug réel trouvé en écrivant le test e2e "propagation live sans reload" du
  // profil (retour Thomas : "ça doit se répercuter sur tout le site, le
  // chat, personnes etc") : `messages` n'est initialisé qu'UNE FOIS depuis
  // `initialMessages` (useState), donc un `router.refresh()` déclenché par le
  // canal `rsvps`/`rsvps_public_data` de EventTabs.tsx (voir ce fichier) a
  // beau relire des données fraîches côté serveur, ce panneau déjà monté
  // n'en tenait jamais compte pour des messages DÉJÀ affichés -- seul le nom
  // capturé au premier montage restait visible, indéfiniment. Corrigé en
  // resynchronisant nom/avatar par `rsvpId` à chaque nouvelle valeur de
  // `initialMessages`, sans jamais toucher au reste (pagination, bulles
  // optimistes, messages reçus depuis en direct).
  useEffect(() => {
    const infoByRsvpId = new Map(
      initialMessages
        .filter((m) => m.rsvpId)
        .map((m) => [m.rsvpId as string, { authorName: m.authorName, authorAvatarUrl: m.authorAvatarUrl }]),
    );
    if (infoByRsvpId.size === 0) return;
    // Différé (même remède que LocationAutocomplete.tsx/EventTabs.tsx pour
    // le même avertissement) : un `setState` synchrone dans le corps de
    // l'effet déclenche des rendus en cascade.
    const timeout = setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => {
          const fresh = m.rsvpId ? infoByRsvpId.get(m.rsvpId) : undefined;
          if (!fresh) return m;
          if (fresh.authorName === m.authorName && fresh.authorAvatarUrl === m.authorAvatarUrl) return m;
          return { ...m, authorName: fresh.authorName, authorAvatarUrl: fresh.authorAvatarUrl };
        }),
      );
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialMessages]);
  const [reactionsByMessage, setReactionsByMessage] =
    useState<Record<string, ChatReactionSummary[]>>(initialReactions);
  const [activeChannel, setActiveChannel] = useState<"main" | "backstage">("main");
  // Compteurs non-lus PAR ONGLET (retour Thomas : "mettre le nombre de notif
  // dans général et/ou coulisses") : dérivés de `messages` (déjà chargés pour
  // les deux canaux, RLS filtre déjà ce qu'un viewer bloqué peut recevoir) +
  // la dernière lecture connue de CHAQUE canal, jamais fusionnés avec
  // `initialLastReadAt`/`firstUnreadId` (ligne "non lus", volontairement
  // limitée à Général). `activeChannelRef` évite une closure périmée dans le
  // handler Realtime plus bas (même piège que `messagesRef`).
  const [lastReadAtByChannel, setLastReadAtByChannel] = useState<{ main: string | null; backstage: string | null }>({
    main: initialLastReadAt,
    backstage: initialBackstageLastReadAt,
  });
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => {
    activeChannelRef.current = activeChannel;
  }, [activeChannel]);

  // Marque un canal comme lu MAINTENANT : état local (remet son compteur à
  // zéro tout de suite) + `chat_reads` en base (survit à un démontage/
  // remontage de ce panneau, voir mount-effect juste en dessous).
  const markChannelRead = useCallback(
    (channel: "main" | "backstage") => {
      const now = new Date().toISOString();
      setLastReadAtByChannel((prev) => ({ ...prev, [channel]: now }));
      if (!viewerRsvpId) return;
      createClient()
        .from("chat_reads")
        .upsert(
          { event_id: eventId, rsvp_id: viewerRsvpId, channel, last_read_at: now },
          { onConflict: "event_id,rsvp_id,channel" },
        )
        .then(() => {});
    },
    [eventId, viewerRsvpId],
  );

  // Bug réel signalé par Thomas : "j'ouvre Chat, j'arrive sur Général, ça
  // affiche 1 message -- si je retourne sur Accueil et reviens sur Chat,
  // Général revient à 1, je suis obligé de cliquer dessus pour que ça
  // parte." Cause : ce panneau se démonte/remonte à chaque changement
  // d'onglet (voir EventTabs) -- seul un clic EXPLICITE sur un onglet
  // (`handleSwitchChannel` plus bas) marquait un canal comme lu, jamais
  // l'onglet actif PAR DÉFAUT au montage (Général), même si l'utilisateur le
  // regarde bel et bien. Corrigé : marque aussi Général comme lu dès le
  // montage, sans attendre un clic sur un onglet déjà affiché.
  useEffect(() => {
    // Différé via microtask (pas un appel direct dans le corps synchrone de
    // l'effet) : évite l'avertissement react-hooks/set-state-in-effect tout
    // en restant imperceptible pour l'utilisateur (même tick de rendu).
    void Promise.resolve().then(() => markChannelRead("main"));
  }, [markChannelRead]);

  const [replyingTo, setReplyingTo] = useState<ChatMessageView | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const authorCacheRef = useRef(new Map<string, { name: string | null; avatarUrl: string | null }>());
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrolledToUnreadRef = useRef(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);

  // Pagination "charger plus ancien" (retour Thomas : "je veux avoir tout
  // les messages de la conversation", confirmé : "quand j'arrive en haut, ça
  // charge les 50 précédents, et ensuite les 50 etc etc"). `messagesRef`
  // évite une closure périmée dans le handler de scroll (voir plus bas, posé
  // une seule fois via un effet à dépendances vides) ; `loadingOlderRef`/
  // `hasMoreOlderRef` (lus/écrits de façon synchrone dans ce même handler)
  // servent de garde-fous contre les appels en double, `loadingOlder` (state)
  // ne sert qu'à afficher le petit indicateur de chargement.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const hasMoreOlderRef = useRef(true);
  // Hauteur/scroll juste avant de préfixer d'anciens messages : sans ça, le
  // navigateur garde le même `scrollTop` alors que du contenu vient d'être
  // inséré AU-DESSUS, ce qui fait visuellement "sauter" la conversation vers
  // le bas au moment du chargement. Réappliqué dans un `useLayoutEffect`
  // (avant peinture) une fois la nouvelle hauteur connue.
  const pendingOlderScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

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

  // L'hôte n'a pas forcément de ligne rsvps tant qu'il n'a jamais voté/écrit
  // (voir date-poll.ts) : on la crée/récupère paresseusement au premier
  // montage du panneau plutôt qu'au chargement de la page.
  useEffect(() => {
    if (viewerRsvpId) return;
    ensureMyChatRsvpId(eventId).then((result) => {
      if (result.ok) setViewerRsvpId(result.rsvpId);
    });
  }, [eventId, viewerRsvpId]);

  // Bug réel signalé par Thomas : "sa photo et son nom doivent devenir
  // anonyme... ça le fait 1 microseconde puis ça revient le nom et la photo
  // de la personne" -- `authorCacheRef` ne s'invalide JAMAIS une fois un
  // rsvpId mis en cache, même après anonymisation (quitter/répondre "non") :
  // un message reçu en direct APRÈS coup (ou une pagination) réutilisait
  // alors le nom/avatar RÉELS déjà en cache, écrasant l'état anonyme
  // correctement affiché entre-temps par le rafraîchissement serveur (voir
  // l'effet de resynchro plus haut). Le message système "left" (voir
  // `update_my_answer`/`leave_or_remove_participant`) est le signal fiable
  // du moment exact où ce cache devient périmé pour ce rsvpId.
  function invalidateAuthorCacheIfLeft(row: MessageRow) {
    if (row.is_system && row.body === "left" && row.rsvp_id) {
      authorCacheRef.current.delete(row.rsvp_id);
    }
  }

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

  // Charge les 50 messages précédant le plus ancien déjà en mémoire (voir
  // commentaire sur `pendingOlderScrollRef` plus haut). Même logique de
  // résolution auteur/photo/réactions que le rattrapage ci-dessous, appliquée
  // à une fenêtre plus ancienne au lieu de la plus récente.
  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreOlderRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const supabase = createClient();

    const { data: rows } = await supabase
      .from("messages")
      .select("id, rsvp_id, channel, body, photo_url, reply_to, is_system, deleted_by_admin, created_at, system_author_name")
      .eq("event_id", eventId)
      .lt("created_at", oldest.createdAt)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<MessageRow[]>();

    if (!rows || rows.length === 0) {
      hasMoreOlderRef.current = false;
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      return;
    }

    const resolved = await Promise.all(
      rows
        .slice()
        .reverse()
        .map(async (row) => {
          invalidateAuthorCacheIfLeft(row);
          const [author, photoUrl] = await Promise.all([
            row.rsvp_id ? resolveAuthor(supabase, row.rsvp_id) : Promise.resolve({ name: null, avatarUrl: null }),
            resolveEventPhotoUrl(supabase, row.photo_url),
          ]);
          return rowToView(row, author, photoUrl);
        }),
    );

    const messageIds = resolved.map((m) => m.id);
    const { data: reactionRows } = await supabase
      .from("message_reactions")
      .select("message_id, rsvp_id, sticker_id")
      .in("message_id", messageIds);
    const byMessage = new Map<string, ChatReactionSummary[]>();
    for (const r of reactionRows ?? []) {
      const list = byMessage.get(r.message_id) ?? [];
      const existing = list.find((e) => e.stickerId === r.sticker_id);
      if (existing) {
        existing.count += 1;
        existing.reactedByMe = existing.reactedByMe || r.rsvp_id === viewerRsvpId;
      } else {
        list.push({ stickerId: r.sticker_id, count: 1, reactedByMe: r.rsvp_id === viewerRsvpId });
      }
      byMessage.set(r.message_id, list);
    }
    setReactionsByMessage((prev) => {
      const next = { ...prev };
      for (const id of messageIds) next[id] = byMessage.get(id) ?? [];
      return next;
    });

    if (listRef.current) {
      pendingOlderScrollRef.current = {
        scrollHeight: listRef.current.scrollHeight,
        scrollTop: listRef.current.scrollTop,
      };
    }

    setMessages((prev) => {
      const byId = new Map(resolved.map((m) => [m.id, m]));
      for (const m of prev) byId.set(m.id, m);
      return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });

    if (rows.length < 50) {
      hasMoreOlderRef.current = false;
    }
    loadingOlderRef.current = false;
    setLoadingOlder(false);
  }, [eventId, resolveAuthor, viewerRsvpId]);

  // Déclenche le chargement des plus anciens en approchant du haut de la
  // liste (scroll infini) : posé une seule fois (dépendances quasi figées,
  // `loadOlderMessages` ne change que si `eventId`/`viewerRsvpId` changent)
  // plutôt que d'être re-attaché à chaque nouveau message.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    function handleScroll() {
      if (el && el.scrollTop < 100) loadOlderMessages();
    }
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [loadOlderMessages]);

  // Restaure la position de lecture juste après l'insertion de messages plus
  // anciens (voir `pendingOlderScrollRef` plus haut) : `useLayoutEffect`,
  // avant peinture, pour ne jamais voir le "saut" vers le bas d'un seul
  // frame.
  useLayoutEffect(() => {
    const pending = pendingOlderScrollRef.current;
    if (!pending || !listRef.current) return;
    const newScrollHeight = listRef.current.scrollHeight;
    listRef.current.scrollTop = pending.scrollTop + (newScrollHeight - pending.scrollHeight);
    pendingOlderScrollRef.current = null;
  }, [messages]);

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
        .select("id, rsvp_id, channel, body, photo_url, reply_to, is_system, deleted_by_admin, created_at, system_author_name")
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
            invalidateAuthorCacheIfLeft(row);
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
      //
      // `initialLastReadAt` vient du Server Component `EventChat`, qui ne se
      // reconstruit qu'au prochain VRAI chargement de page -- il reste donc
      // figé à la valeur d'avant cette session si on revient sur l'onglet
      // Chat après être passé par Accueil/Personnes/Participer (ce panneau
      // se démonte/remonte, mais la page elle-même n'est jamais rechargée).
      // `readSessionLastReadAt` (sessionStorage, voir lastRead.ts) retient
      // la lecture la plus récente DE CETTE SESSION navigateur, mise à jour
      // par `EventTabs.handleTabClick` à chaque clic sur l'onglet Chat et
      // par le handler Realtime plus bas : on prend la plus récente des deux
      // (retour Thomas : "message non lu reste toujours affiché au même
      // endroit" après un aller-retour vers un autre onglet).
      const sessionLastReadAt = readSessionLastReadAt(eventId);
      const effectiveLastReadAt =
        sessionLastReadAt && sessionLastReadAt > (initialLastReadAt ?? "")
          ? sessionLastReadAt
          : initialLastReadAt;
      const unread = resolved.find(
        (m) =>
          m.channel === "main" &&
          !m.isSystem &&
          m.rsvpId !== initialViewerRsvpId &&
          m.createdAt > (effectiveLastReadAt ?? ""),
      );
      setFirstUnreadId(unread?.id ?? null);

      // Écrit la position de lecture APRÈS l'avoir utilisée ci-dessus (pas
      // avant, voir EventTabs.handleTabClick) : au prochain démontage/
      // remontage de ce panneau dans la même session navigateur (retour sur
      // Chat après Accueil/Personnes/Participer), la ligne "non lus" ne
      // réapparaîtra plus pour des messages déjà affichés lors de CE
      // passage.
      writeSessionLastReadAt(eventId, new Date().toISOString());
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, resolveAuthor, initialLastReadAt, initialViewerRsvpId]);

  useEffect(() => {
    const supabase = createClient();

    async function handleInsert(row: MessageRow) {
      invalidateAuthorCacheIfLeft(row);
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
      // message déjà vu"). Comportement HISTORIQUE conservé tel quel (ligne
      // "non lus" + sessionStorage, canal Général uniquement).
      if (row.channel === "main" && row.rsvp_id !== viewerRsvpId && viewerRsvpId) {
        const now = new Date().toISOString();
        // Relais sessionStorage (voir lastRead.ts) : même raison que dans
        // EventTabs.handleTabClick, ce panneau se démonte/remonte à chaque
        // changement d'onglet sans que la page ne recharge.
        writeSessionLastReadAt(eventId, now);
        await supabase
          .from("chat_reads")
          .upsert(
            { event_id: eventId, rsvp_id: viewerRsvpId, channel: "main", last_read_at: now },
            { onConflict: "event_id,rsvp_id,channel" },
          );
      }

      // Compteur PAR ONGLET (retour Thomas, ajouté après coup) : un message
      // qui arrive sur le canal ACTUELLEMENT CONSULTÉ est considéré vu tout
      // de suite (garde son compteur à 0 pendant qu'on le regarde) --
      // indépendant du bloc ci-dessus, qui ne concerne QUE Général et la
      // ligne "non lus". `activeChannelRef` (pas `activeChannel`) : ce
      // handler est posé une seule fois par cet effet, une closure directe
      // serait périmée dès le premier changement d'onglet.
      if (row.channel === activeChannelRef.current && row.rsvp_id !== viewerRsvpId && viewerRsvpId) {
        const now = new Date().toISOString();
        setLastReadAtByChannel((prev) => ({ ...prev, [row.channel]: now }));
        await supabase
          .from("chat_reads")
          .upsert(
            { event_id: eventId, rsvp_id: viewerRsvpId, channel: row.channel, last_read_at: now },
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

  // Compteurs non-lus par onglet (voir déclaration de `lastReadAtByChannel`
  // plus haut) : un canal jamais lu (`null`) compte TOUT ce qui est chargé
  // comme non-lu, cohérent avec le comportement déjà établi ailleurs
  // (`computeUnreadCount`/`initialLastReadAt`) pour un tout nouveau participant.
  const mainUnreadCount = useMemo(
    () =>
      messages.filter(
        (m) => m.channel === "main" && !m.isSystem && m.rsvpId !== viewerRsvpId && m.createdAt > (lastReadAtByChannel.main ?? ""),
      ).length,
    [messages, lastReadAtByChannel.main, viewerRsvpId],
  );
  const backstageUnreadCount = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.channel === "backstage" &&
          !m.isSystem &&
          m.rsvpId !== viewerRsvpId &&
          m.createdAt > (lastReadAtByChannel.backstage ?? ""),
      ).length,
    [messages, lastReadAtByChannel.backstage, viewerRsvpId],
  );

  useEffect(() => {
    // Charger d'anciens messages (scroll infini) fait aussi grandir
    // `visibleMessages.length`, mais PAR LE HAUT : sans ce garde-fou, cet
    // effet forcerait un saut vers le bas à chaque page chargée, annulant la
    // restauration de position faite par ailleurs (`pendingOlderScrollRef`).
    // Seul un changement du DERNIER message (nouveau message réel, ou
    // changement d'onglet) doit déclencher un scroll — jamais un ajout en
    // tête de liste.
    const lastId = visibleMessages[visibleMessages.length - 1]?.id ?? null;
    const isChangeAtBottom = lastId !== lastMessageIdRef.current;
    lastMessageIdRef.current = lastId;
    if (!isChangeAtBottom) return;

    if (!scrolledToUnreadRef.current && firstUnreadId && activeChannel === "main") {
      const unreadEl = listRef.current?.querySelector(`[data-message-id="${firstUnreadId}"]`);
      if (unreadEl) {
        scrolledToUnreadRef.current = true;
        unreadEl.scrollIntoView({ block: "start" });
        return;
      }
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
    // `visibleMessages` volontairement absent : c'est un nouveau tableau à
    // chaque rendu (`.filter()`), l'ajouter ferait tourner cet effet à
    // chaque rendu au lieu de seulement quand la longueur change réellement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMessages.length, activeChannel, firstUnreadId]);

  function handleOptimisticSetReaction(messageId: string, oldEmoji: string | null, newEmoji: string | null) {
    if (!viewerRsvpId) return;
    setReactionsByMessage((prev) =>
      applyReactionChange(prev, messageId, viewerRsvpId, viewerRsvpId, oldEmoji, newEmoji),
    );
  }

  // Optimistic UI à l'envoi (même principe que les réactions ci-dessus,
  // déjà en place) : la bulle apparaît immédiatement au clic, avant même la
  // réponse du serveur — le délai perçu passe de ~200-500ms (aller-retour
  // complet Postgres + Realtime avant que son PROPRE message ne revienne) à
  // zéro. `handleOptimisticSend` ajoute la bulle temporaire (id `temp:...`),
  // `handleSendSettled` la réconcilie une fois la réponse connue.
  function handleOptimisticSend(message: ChatMessageView) {
    setMessages((prev) => [...prev, message]);
  }

  function handleSendSettled(tempId: string, result: { ok: true; id: string } | { ok: false }) {
    setMessages((prev) => {
      if (!result.ok) return prev.filter((m) => m.id !== tempId);
      // Course rare mais possible : l'écho Realtime du même envoi (voir
      // handleInsert) est arrivé avant que cette réconciliation ne s'exécute
      // — la ligne réelle est alors déjà présente, on retire simplement la
      // bulle temporaire plutôt que de risquer un doublon.
      if (prev.some((m) => m.id === result.id)) return prev.filter((m) => m.id !== tempId);
      return prev.map((m) => (m.id === tempId ? { ...m, id: result.id, status: undefined } : m));
    });
  }

  // Retour Thomas : cliquer sur la citation d'un message ("répondu à X")
  // doit ramener directement à la hauteur du message original, avec un
  // contour orange clignotant 5 secondes pour le repérer (voir la classe
  // `.chat-highlight`/`highlight-blink` dans globals.css). Si le message
  // cité n'est plus chargé (au-delà de la fenêtre des 50 derniers messages,
  // pas de pagination "charger plus ancien" pour l'instant), `querySelector`
  // ne trouve rien : no-op silencieux plutôt qu'une erreur, cas limite
  // assumé pour l'instant.
  function scrollToAndHighlight(messageId: string) {
    const el = listRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setHighlightedMessageId(messageId);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedMessageId(null), 5000);
  }

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  // Retour Thomas : "s'il clique sur coulisses, il faut dire vous avez pas
  // accès" -- seul l'onglet consulté est concerné, jamais tout le panneau ;
  // symétrique pour Général depuis l'ajout du bloc 'chat' (retour Thomas : un
  // bénéficiaire masqué de la liste Personnes restait quand même visible
  // comme auteur de messages dans le chat général).
  const backstageBlockedForViewer = activeChannel === "backstage" && hideBackstageForViewer;
  const mainBlockedForViewer = activeChannel === "main" && hideMainForViewer;
  const activeChannelBlockedForViewer = backstageBlockedForViewer || mainBlockedForViewer;

  // Bannière "X a/n'a pas accès" (retour Thomas : jamais silencieuse dans un
  // sens comme dans l'autre) : les deux onglets partagent désormais le même
  // mécanisme, seuls le texte et les prénoms diffèrent selon l'onglet actif.
  const activeChannelBanner =
    activeChannel === "backstage"
      ? { names: backstageBeneficiaryNames, hidden: isBackstageHiddenForBeneficiaries, accessKey: "backstageAccessNote" as const, noAccessKey: "backstageNoAccessNote" as const }
      : { names: chatBeneficiaryNames, hidden: isChatHiddenForBeneficiaries, accessKey: "chatAccessNote" as const, noAccessKey: "chatNoAccessNote" as const };

  // Changer d'onglet marque IMMÉDIATEMENT ce canal comme lu (retour Thomas :
  // compteur par onglet) -- remet son compteur à zéro tout de suite plutôt
  // que d'attendre un message qui le ferait via `handleInsert` plus bas.
  // Même mécanique que le mount-effect plus haut (Général au premier
  // affichage), factorisée dans `markChannelRead`.
  function handleSwitchChannel(channel: "main" | "backstage") {
    setActiveChannel(channel);
    markChannelRead(channel);
  }

  return (
    // Pas le composant `Card` partagé ici (contrairement au reste de l'app) :
    // son `p-6` intégré est impossible à annuler proprement en surchargeant
    // juste `className` (deux classes Tailwind sur la même propriété, l'ordre
    // de priorité réelle dépend de l'ordre de génération de la feuille de
    // style, pas de l'ordre dans le JSX -- piège connu). Un `div` autonome
    // avec le même habillage visuel (bordure/coins/ombre) mais SANS padding
    // permet au fond gris de remplir vraiment toute la boîte, bords compris
    // (retour Thomas : "il faut remplir tout le box du chat") -- chaque
    // enfant (bandeau Coulisses, liste, composer) gère son propre padding.
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-konfeti border border-border bg-canvas shadow-konfeti">
      {/* Onglets Général/Coulisses (retour Thomas : "l'arrière doit être la
          même couleur que le chat, comme si ça ne faisait qu'un avec le
          chat" -- `bg-canvas`, pas `bg-surface`, pour fusionner visuellement
          avec le corps du chat juste en dessous, plus de bandeau blanc qui
          tranche. "Onglet actif vert clair, onglet non actif vert foncé" :
          les deux onglets portent désormais leur propre fond vert en
          permanence, seule la nuance change selon lequel est actif -- plus
          de pilule violette). Retour Thomas ensuite : le fond vert foncé de
          l'onglet inactif rendait le texte blanc à peine lisible -- remplacé
          par une bulle au contour vert (fond transparent) et un texte foncé,
          cohérent avec le reste de la palette. Toujours affichés, y compris
          sans aucun bénéficiaire désigné sur l'événement (bug réel signalé
          par Thomas, voir EventChat.tsx). */}
      <div className="flex shrink-0 gap-1 bg-canvas p-3 pb-0">
        <div className="flex flex-1 gap-1 rounded-full p-1">
          {(["main", "backstage"] as const).map((ch) => {
            const unreadForTab = ch === "main" ? mainUnreadCount : backstageUnreadCount;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => handleSwitchChannel(ch)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition-colors ${
                  activeChannel === ch
                    ? "border-accent-mint bg-accent-mint text-foreground"
                    : "border-accent-mint bg-transparent text-foreground"
                }`}
              >
                <span>{t(ch === "main" ? "tabs.main" : "tabs.backstage")}</span>
                {/* Compteur PAR ONGLET (retour Thomas : "mettre le nombre de
                    notif dans général et/ou coulisses") -- jamais affiché
                    sur l'onglet déjà actif (son compteur reste à 0, voir
                    `handleSwitchChannel`), ni sur un canal bloqué pour ce
                    viewer (RLS ne lui livre alors jamais ces messages, donc
                    `unreadForTab` y vaut structurellement 0). */}
                {unreadForTab > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-coral px-1 text-xs font-bold text-white">
                    {unreadForTab}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bannière "X a accès" / "X n'a pas accès" (retour Thomas : "il faut
          le dire quand X a accès et aussi quand elle a pas accès" -- jamais
          silencieuse dans un sens comme dans l'autre), affichée aux AUTRES
          participants pendant qu'ils consultent l'onglet concerné -- jamais
          au(x) bénéficiaire(s) concerné(s) eux-mêmes (qui voient le chat
          normal ou le placeholder à la place, voir plus bas). Placée SOUS
          les onglets (retour Thomas : positionnement corrigé, elle était
          au-dessus). */}
      {activeChannelBanner.names.length > 0 && (
        <div
          className={`shrink-0 px-4 py-2 text-center text-xs font-semibold ${
            activeChannelBanner.hidden ? "bg-accent-coral/10 text-accent-coral" : "bg-accent-mint/10 text-accent-mint"
          }`}
        >
          {t(activeChannelBanner.hidden ? activeChannelBanner.noAccessKey : activeChannelBanner.accessKey, {
            count: activeChannelBanner.names.length,
            names: joinNames(activeChannelBanner.names),
          })}
        </div>
      )}

      {/* `bg-canvas` (gris clair neutre, retour Thomas : "le fond d'écran du
          chat doit être gris clair") donne enfin un vrai contraste bulle/fond
          -- les bulles reçues (blanches) et le fond partageaient exactement
          la même couleur jusqu'ici (l'ancien `Card` blanc), les rendant
          invisibles à l'œil.

          `ChatConfettiBackground` doit être ANCRÉ DANS le contenu qui défile,
          pas épinglé au cadre visible (retour Thomas, après un premier essai
          en sens inverse : "les confettis doivent être ancrés dans le chat,
          quand je défile vers le bas ça doit être des autres" -- des pièces
          DIFFÉRENTES doivent apparaître plus bas dans une longue conversation,
          pas toujours les 26 mêmes figées en haut). Le confetti est donc
          posé en `absolute inset-0` DANS ce wrapper interne `relative z-0`
          (pas dans le `div` scrollable lui-même) : ce wrapper est en flux
          normal à l'intérieur de la zone défilante, sa hauteur "auto" grandit
          avec le nombre de messages empilés (les enfants en position absolue
          ne comptent pas dans ce calcul de hauteur, seuls les messages en
          flux normal le font) -- le confetti, en `inset-0` dedans, s'étire
          donc sur TOUTE la hauteur de la conversation, pas seulement la
          fenêtre visible initiale, et défile avec elle comme un vrai élément
          de contenu. `z-0` (pas juste `relative`) : sans z-index explicite,
          un enfant à `-z-10` "s'échappe" vers le contexte d'empilement d'un
          ancêtre plus large -- rendu alors DERRIÈRE le `bg-canvas` (opaque)
          au lieu de devant, un piège déjà rencontré une fois. */}
      <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {/* Retour Thomas : "s'il clique sur coulisses, il faut dire vous
            avez pas accès" -- seul le CONTENU de l'onglet consulté est
            remplacé, jamais tout le panneau (les onglets au-dessus restent
            cliquables pour changer de canal) ; symétrique pour Général
            depuis l'ajout du bloc 'chat'. */}
        {activeChannelBlockedForViewer ? (
          <p className="py-8 text-center text-sm font-semibold text-foreground">{t("noAccess")}</p>
        ) : (
        <div className="relative z-0 flex min-h-full flex-col gap-0">
          {/* `min-h-full` (retour Thomas : "je veux qu'il fasse tout le chat
              même si le chat est vide") : sans ça, ce wrapper ne mesure que
              la hauteur de son contenu réel ("Aucun message...", quelques
              px), et le confetti (`absolute inset-0` DEDANS) ne couvrait
              donc qu'un tout petit bandeau en haut d'une zone vide, jamais
              toute la boîte visible. `min-h-full` le force à couvrir AU
              MOINS toute la hauteur visible du parent défilant, tout en le
              laissant grandir naturellement au-delà une fois assez de
              messages empilés (jamais de hauteur fixe qui couperait une
              longue conversation). */}
          <ChatConfettiBackground />
          {loadingOlder && (
            <p className="py-2 text-center text-xs text-foreground/50">{t("loadingOlder")}</p>
          )}
          {visibleMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground/60">{t("emptyState")}</p>
          ) : (
            visibleMessages.map((message, index) => {
              if (!viewerRsvpId) return null;
              const previous = visibleMessages[index - 1];
              const isUnreadStart = message.id === firstUnreadId;
              const isOwnMessage = message.rsvpId === viewerRsvpId;
              // Regroupe les messages consécutifs du même auteur (comme
              // WhatsApp/Messenger) : nom + avatar ne se répètent pas à chaque
              // ligne, seulement au premier message d'une série — gain d'espace
              // vertical direct (retour Thomas : "il y a trop d'espace").
              // Toujours réaffiché juste après la ligne "non lus", pour ne pas
              // perdre le repère de qui parle à la reprise de lecture. Jamais
              // affiché sur ses PROPRES messages (bulle colorée + alignement à
              // droite suffisent à s'identifier, comme dans tout chat pro) —
              // accessoirement, ça évite d'avoir besoin de connaître son propre
              // nom pour la bulle optimiste ajoutée avant confirmation serveur.
              const previousIsSystem = previous?.isSystem ?? false;
              const showHeader =
                !message.isSystem &&
                !isOwnMessage &&
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
                    isOwnMessage={isOwnMessage}
                    isAdmin={isAdmin}
                    viewerRsvpId={viewerRsvpId}
                    showHeader={showHeader}
                    isHighlighted={message.id === highlightedMessageId}
                    reactions={reactionsByMessage[message.id] ?? []}
                    replyToPreview={message.replyTo ? (messagesById.get(message.replyTo) ?? null) : null}
                    onReply={setReplyingTo}
                    onJumpToMessage={scrollToAndHighlight}
                    onOptimisticSetReaction={handleOptimisticSetReaction}
                  />
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
        )}
      </div>

      {viewerRsvpId && !activeChannelBlockedForViewer && (
        <div className="shrink-0 bg-surface px-4 pb-4">
          <MessageComposer
            key={activeChannel}
            eventId={eventId}
            rsvpId={viewerRsvpId}
            channel={activeChannel}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onOptimisticSend={handleOptimisticSend}
            onSendSettled={handleSendSettled}
          />
        </div>
      )}
    </div>
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
    systemAuthorName: row.system_author_name,
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
