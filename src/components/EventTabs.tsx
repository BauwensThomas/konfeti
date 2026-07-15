"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureRealtimeAuth } from "@/lib/supabase/realtime-auth";
import { subscribeToEventChat } from "@/lib/chat/realtime";

type TabKey = "accueil" | "chat" | "personnes" | "participer";

const TABS: TabKey[] = ["accueil", "chat", "personnes", "participer"];

// Mode Jour J (brief 4.11) : "Aller au chat"/"Voir qui a apporté quoi"
// depuis JourJCard.tsx (rendu côté serveur, imbriqué DANS le prop `accueil`
// déjà passé à ce composant) doivent pouvoir changer l'onglet actif ici,
// alors qu'ils ne reçoivent aucune prop directe de ce composant. Un contexte
// React est le seul pont possible dans ce sens (server → prop ReactNode →
// petit sous-composant client qui, lui, peut consommer ce contexte).
// `null` hors de ce provider (jamais utilisé ailleurs qu'ici, pas besoin de
// lever une erreur).
//
// Retour Thomas : cliquer sur la bannière Stripe (`PotConnectionBanner.tsx`,
// dans `accueil`) doit ouvrir directement le sous-onglet Cagnotte de
// `ParticiperTabs.tsx` (dans `participer`), pas juste l'onglet Participer
// tel quel (qui retombe sinon toujours sur Sondages par défaut). Ces deux
// composants sont des enfants FRÈRES de ce contexte, jamais l'un de l'autre
// -- `participerSubTab` transite par une ref (pas un state, pour ne
// provoquer aucun re-render ici) consommée une seule fois au montage de
// `ParticiperTabs` via `consumeParticiperSubTab` puis aussitôt effacée : un
// retour ultérieur sur Participer par le bouton du HAUT (pas la bannière)
// retombe alors normalement sur Sondages, jamais bloqué sur Cagnotte.
export const TabNavigationContext = createContext<{
  setActive: (tab: TabKey, participerSubTab?: string) => void;
  consumeParticiperSubTab: () => string | null;
} | null>(null);

export function useTabNavigation() {
  return useContext(TabNavigationContext);
}

export function EventTabs({
  accueil,
  personnes,
  chat,
  participer,
  pendingCount = 0,
  pendingBringCount = 0,
  pendingPollsCount = 0,
  eventId,
  viewerRsvpId = null,
  initialUnreadCount = 0,
  chatAllowedChannels = ["main"],
}: {
  accueil: ReactNode;
  personnes?: ReactNode;
  chat?: ReactNode;
  participer?: ReactNode;
  pendingCount?: number;
  // Brief 4.4, retour Thomas : "une notif rouge sur participer comme pour
  // personnes" -- items "qui apporte quoi" proposés par un invité, en
  // attente de validation admin (même pattern que `pendingCount`).
  pendingBringCount?: number;
  // Même pattern, pour les sondages proposés par un invité.
  pendingPollsCount?: number;
  eventId?: string;
  viewerRsvpId?: string | null;
  initialUnreadCount?: number;
  // Retour Thomas : "il faut faire attention que quand on parle dans les
  // coulisses et que le bénéficiaire n'a pas accès, qu'il ne reçoive pas de
  // bulle de notification sur Chat" -- un canal absent de cette liste ne
  // contribue jamais à la pastille, ni au compte initial (page.tsx) ni au
  // filtre Realtime ci-dessous.
  chatAllowedChannels?: ("main" | "backstage")[];
}) {
  const t = useTranslations("EventPage");
  const router = useRouter();
  const [active, setActive] = useState<TabKey>("accueil");
  // Voir le commentaire de `TabNavigationContext` plus haut : simple ref (pas
  // de state) puisque rien ici n'a besoin de re-render quand elle change.
  const participerSubTabRef = useRef<string | null>(null);
  function setActiveWithSubTab(tab: TabKey, participerSubTab?: string) {
    if (participerSubTab) participerSubTabRef.current = participerSubTab;
    setActive(tab);
  }
  function consumeParticiperSubTab() {
    const value = participerSubTabRef.current;
    participerSubTabRef.current = null;
    return value;
  }
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  // Suivi des messages ayant contribué au compteur non-lus DEPUIS le montage
  // de ce composant (jamais ceux déjà comptés côté serveur dans
  // `initialUnreadCount`, dont on n'a pas les id ici) : permet de faire
  // reculer le compteur si l'un de CES messages précis est modéré avant
  // d'avoir été lu (retour Thomas : "il faut pas faire -1 [pas de -1 du tout,
  // en fait] si ça n'a pas été lu... quand un admin supprime un message").
  const unreadMessageIdsRef = useRef(new Set<string>());
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Tout changement de participants (approbation, rôle, cagnotte...) doit se
  // refléter partout instantanément (retour Thomas : "je ne veux pas devoir
  // à chaque fois refresh dès qu'on modifie quelque chose"), pas seulement
  // quand l'onglet Personnes est ouvert (l'abonnement y vivait jusqu'ici,
  // démonté avec le reste du panneau sur les autres onglets). Toujours monté
  // ici, comme le badge non-lus : `router.refresh()` recharge tout
  // l'arbre de composants serveur de la page (Accueil, Personnes, boutons
  // Modifier/Supprimer/Partager compris), pas seulement l'onglet actif.
  //
  // Jamais de `filter: event_id=eq...` ici (contrairement à `messages`) :
  // Realtime rejette la souscription entière avec "invalid column for filter
  // event_id" dès qu'un filtre porte sur `rsvps.event_id` en UPDATE — bug
  // confirmé dans les frames WebSocket brutes (persiste même avec `replica
  // identity full` et après retrait/réinsertion de la table dans la
  // publication), cause exacte non identifiée côté Supabase. Sans filtre
  // serveur, le contenu du payload (`new`/`old`) revient parfois vide selon
  // le type d'écriture (masquage RLS côté Realtime, indépendant de ce que
  // l'utilisateur peut lire par ailleurs) : plutôt que de dépendre de son
  // contenu, tout événement reçu sur ce canal (déjà scoping par `eventId`
  // dans le nom du topic) déclenche `router.refresh()` sans condition — RLS
  // continue de toute façon à filtrer ce que la page recharge réellement.
  //
  // `ensureRealtimeAuth` avant de créer le canal : ce composant monte dès le
  // chargement de la page (contrairement au panneau Chat, ouvert seulement
  // au clic), assez tôt pour parfois devancer la synchro du JWT vers la
  // couche Realtime — un canal souscrit trop tôt reste authentifié "anon"
  // pour toute sa durée de vie (voir ce fichier pour le détail complet du
  // piège, découvert via les frames WebSocket brutes : "Error 401:
  // Unauthorized" caché derrière un statut `SUBSCRIBED` normal côté client).
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`event-${eventId}-rsvps`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "rsvps" },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rsvps" },
          () => router.refresh(),
        )
        // `rsvps` (brute) ne suffit pas seule : sa policy RLS
        // (`rsvps_select_own_or_admin`) ne montre à un participant NON-admin
        // que SA PROPRE ligne — il ne recevait donc jamais l'événement pour
        // le changement de quelqu'un d'autre (retour Thomas : "ça ne
        // refresh pas tout seul" pour les non-admins spécifiquement).
        // `rsvps_public_data` (table miroir) a une policy bien plus
        // permissive (tout admin OU participant approuvé voit les autres) :
        // ajoutée en plus, jamais à la place, pour couvrir les deux profils.
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "rsvps_public_data" },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rsvps_public_data" },
          () => router.refresh(),
        )
        // Toute modification via le wizard "Modifier" (titre, date, adresse,
        // thème, qui peut partager le lien, cagnotte...) doit aussi se
        // refléter automatiquement (retour Thomas : "toutes les
        // modifications apportées doivent s'actualiser automatiquement chez
        // tout le monde"), pas seulement les changements de participants.
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "events" },
          () => router.refresh(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  // Un vote sur le sondage de date (ajout OU retrait, chacun coche/décoche
  // librement) doit aussi apparaître en direct chez les autres participants
  // sur l'onglet Accueil (retour Thomas, même exigence que les rsvps/events
  // ci-dessus étendue au vote). `date_options` n'a pas besoin de son propre
  // abonnement : elle n'est modifiée que par `updateEvent`, toujours
  // accompagnée d'une mise à jour de `events` (canal ci-dessus).
  //
  // Sur un CANAL À PART, jamais fusionné avec celui au-dessus : un bug réel
  // rencontré en le construisant l'a confirmé -- une seule table demandée
  // dans un `.on(...)` qui n'est pas (encore) activée côté Realtime fait
  // échouer l'abonnement de TOUT le canal ("Unable to subscribe... Please
  // check Realtime is enabled", visible dans les frames WebSocket brutes),
  // y compris les tables qui, elles, fonctionnaient très bien. Isoler chaque
  // groupe de tables sur son propre canal limite la casse à lui seul si l'une
  // d'elles n'est pas (encore) prête côté base.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`event-${eventId}-date-votes`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "date_votes" },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "date_votes" },
          () => router.refresh(),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "date_votes" },
          () => router.refresh(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  // "Qui apporte quoi" (brief 4.4) : canal Realtime SÉPARÉ, même précaution
  // que `date_votes` ci-dessus. Sert à la fois la version compacte de
  // l'Accueil et la liste complète de l'onglet Participer (BringListClient
  // n'a plus sa propre souscription) -- un `router.refresh()` recharge tout
  // l'arbre de Server Components de la page, peu importe quel onglet est
  // actif au moment du changement.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`event-${eventId}-bring`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bring_items" },
          () => router.refresh(),
        )
        // `bring_claims` n'a pas de colonne `event_id` (comme
        // `message_reactions`) : pas de filtre possible ici, on rafraîchit à
        // chaque changement de claim tout court -- imprécision acceptée,
        // même philosophie que le reste du projet (voir DECISIONS.md).
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bring_claims" },
          () => router.refresh(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  // Sondages : canal Realtime SÉPARÉ, même précaution que "qui apporte quoi"
  // ci-dessus (jamais fusionné à un canal existant -- une seule table pas
  // encore activée côté publication fait échouer l'abonnement de TOUT le
  // canal partagé, voir DECISIONS.md).
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`event-${eventId}-polls`)
        .on("postgres_changes", { event: "*", schema: "public", table: "polls" }, () => router.refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "poll_options" }, () => router.refresh())
        // `poll_votes` n'a pas de colonne `event_id` : même imprécision
        // acceptée que `bring_claims` ci-dessus.
        .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes" }, () => router.refresh())
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  // Cagnotte : canal Realtime SÉPARÉ, même précaution que "qui apporte quoi"/
  // sondages ci-dessus. Bug réel signalé par Thomas ("pas de refresh
  // automatiquement sur mon site" après une contribution payée) : le webhook
  // Stripe met bien `pot_contributions.status` à jour en base, mais sans cet
  // abonnement personne ne le voyait sans rafraîchir la page à la main.
  // `pot_payouts` sur le même canal (même table events_id, pas de piège
  // "pas de colonne event_id" ici contrairement à bring_claims/poll_votes).
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`event-${eventId}-pot`)
        .on("postgres_changes", { event: "*", schema: "public", table: "pot_contributions" }, () => router.refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "pot_payouts" }, () => router.refresh())
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  // Réf plutôt qu'une dépendance directe de l'effet Realtime ci-dessous (même
  // pattern qu'`activeRef`) : `chatAllowedChannels` est un tableau littéral
  // recréé à chaque rendu par l'appelant, l'ajouter aux dépendances
  // resouscrirait le canal Realtime à chaque rendu pour rien.
  const chatAllowedChannelsRef = useRef(chatAllowedChannels);
  useEffect(() => {
    chatAllowedChannelsRef.current = chatAllowedChannels;
  }, [chatAllowedChannels]);

  // Abonnement léger dédié au badge (canal Realtime distinct de celui du
  // panneau Chat lui-même, voir src/lib/chat/realtime.ts) : toujours monté,
  // contrairement au panneau qui n'existe que sur l'onglet actif — même
  // raison qu'au-dessus pour `ensureRealtimeAuth`.
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const supabase = createClient();
    let realtimeChannel: ReturnType<typeof subscribeToEventChat> | null = null;

    ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      realtimeChannel = subscribeToEventChat(
        supabase,
        eventId,
        {
          onMessageInsert: (message) => {
            if (!chatAllowedChannelsRef.current.includes(message.channel)) return;
            if (activeRef.current === "chat") return;
            if (message.rsvp_id === viewerRsvpId) return;
            unreadMessageIdsRef.current.add(message.id);
            setUnreadCount((prev) => prev + 1);
          },
          // Retour Thomas : un admin qui supprime un message avant qu'un
          // autre participant ne l'ait lu (chat fermé/autre onglet) ne doit
          // pas laisser sa pastille "+1" pour un message qui n'existe plus —
          // seulement pour un message qui a réellement contribué à CE
          // compteur (`unreadMessageIdsRef`, jamais pour un message déjà
          // compté par le serveur avant le montage, dont l'id est inconnu ici).
          onMessageUpdate: (message) => {
            if (!message.deleted_by_admin) return;
            if (!unreadMessageIdsRef.current.has(message.id)) return;
            unreadMessageIdsRef.current.delete(message.id);
            setUnreadCount((prev) => Math.max(0, prev - 1));
          },
          // Une réaction posée sur son message, pendant qu'on est sur un
          // autre onglet, doit alerter comme un nouveau message (retour
          // Thomas : "pas de refresh automatique ni de notification +1").
          // `message_reactions` n'a pas de colonne `channel` (pas de jointure
          // ici pour rester léger) : imprécision acceptée, une réaction sur
          // un message Coulisses incrémente aussi le badge — même philosophie
          // que le reste de ce canal (mieux vaut un signal occasionnellement
          // trop large qu'un filtre qui casse toute la souscription).
          onReactionInsert: (reaction) => {
            if (activeRef.current === "chat") return;
            if (reaction.rsvp_id === viewerRsvpId) return;
            setUnreadCount((prev) => prev + 1);
          },
          // Symétrique de l'ajout (retour Thomas, deux bugs liés en un seul
          // correctif) : (1) "si je retire le smiley puis que j'en remets un,
          // j'ai +2 notif" — poser/retirer/reposer la MÊME réaction avant que
          // l'autre ait ouvert le chat déclenchait 2 INSERT (+1 chacun) sans
          // jamais compenser le DELETE intermédiaire, gonflant le compteur à
          // tort. (2) "si je retire un smiley à une discussion non lue, la
          // notif doit partir" — un retrait doit lui aussi faire reculer le
          // compteur, pas seulement l'ajout le faire avancer. `Math.max(0, …)`
          // : ne descend jamais sous zéro (le retrait d'une réaction posée
          // AVANT le montage de ce composant, donc jamais comptée, ne doit
          // pas rendre le badge négatif).
          onReactionDelete: (reaction) => {
            if (activeRef.current === "chat") return;
            if (reaction.rsvp_id === viewerRsvpId) return;
            setUnreadCount((prev) => Math.max(0, prev - 1));
          },
        },
        "badge",
      );
    });

    return () => {
      cancelled = true;
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, [eventId, viewerRsvpId]);

  function handleTabClick(tab: TabKey) {
    setActive(tab);
    if (tab === "chat" && eventId && viewerRsvpId) {
      setUnreadCount(0);
      unreadMessageIdsRef.current.clear();
      // Pas d'écriture sessionStorage ici (voir lastRead.ts) : ce clic
      // s'exécute AVANT que `ChatRoom` ne monte et ne calcule sa ligne
      // "non lus" à partir de la dernière lecture connue -- écrire "now" ici
      // effacerait la fenêtre de non-lus avant même qu'elle ait pu être
      // calculée (bug réel rencontré : la ligne ne s'affichait plus du
      // tout, y compris au tout premier passage). C'est `ChatRoom` lui-même
      // qui écrit cette valeur, une fois la ligne "non lus" déjà déterminée.
      const now = new Date().toISOString();
      const supabase = createClient();
      supabase
        .from("chat_reads")
        .upsert(
          { event_id: eventId, rsvp_id: viewerRsvpId, channel: "main", last_read_at: now },
          { onConflict: "event_id,rsvp_id,channel" },
        )
        .then(() => {});
    }
  }

  return (
    <div className="flex w-full max-w-lg lg:max-w-2xl flex-col gap-4">
      <div className="flex rounded-full bg-surface p-1 shadow-konfeti">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabClick(tab)}
            // Pastille désormais en ligne avec le libellé (retour Thomas : "à
            // la même hauteur que le texte et plus proche du texte"), plus
            // un badge flottant au coin (`absolute -right-1 -top-1`) décalé
            // au-dessus/à côté du texte — un simple `flex items-center gap-1`
            // aligne les deux sur la même ligne, à la même hauteur.
            className={`flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              active === tab ? "bg-primary text-white" : "text-foreground/70"
            }`}
          >
            <span>{t(`tabs.${tab}`)}</span>
            {tab === "personnes" && pendingCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-coral px-1 text-xs font-bold text-white">
                {pendingCount}
              </span>
            )}
            {/* Retour Thomas : plus de chiffre agrégé ici depuis l'ajout des
                sous-onglets internes (Sondages/Qui apporte quoi/Cagnotte,
                voir `ParticiperTabs.tsx`) -- chacun garde son propre chiffre
                précis une fois l'onglet ouvert, ce niveau-ci se contente
                d'un simple point (même traitement que Chat ci-dessous). */}
            {tab === "participer" && pendingBringCount + pendingPollsCount > 0 && (
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-coral" />
            )}
            {/* Simple pastille (pas de chiffre) sur l'onglet Chat au niveau
                page -- retour Thomas : "mettre juste une boule rouge à côté
                de chat", le détail (combien, où) n'apparaît qu'une fois le
                panneau ouvert, sur les sous-onglets Général/Coulisses (voir
                ChatRoom.tsx). */}
            {tab === "chat" && unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-coral"
              />
            )}
          </button>
        ))}
      </div>

      <TabNavigationContext.Provider value={{ setActive: setActiveWithSubTab, consumeParticiperSubTab }}>
        {active === "accueil" ? (
          accueil
        ) : active === "personnes" && personnes ? (
          personnes
        ) : active === "chat" && chat ? (
          chat
        ) : active === "participer" && participer ? (
          participer
        ) : (
          <p className="py-16 text-center text-sm text-foreground/60">{t("comingSoon")}</p>
        )}
      </TabNavigationContext.Provider>
    </div>
  );
}
