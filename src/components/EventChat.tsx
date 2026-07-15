import { createClient } from "@/lib/supabase/server";
import { resolveAvatarUrl, resolveEventPhotoUrl } from "@/lib/avatars";
import { computeUnreadCount } from "@/lib/chat/unread";
import { ChatRoom } from "@/components/chat/ChatRoom";
import type { ChatMessageView, ChatReactionSummary } from "@/components/chat/types";

type RawMessageRow = {
  id: string;
  rsvp_id: string | null;
  channel: "main" | "backstage";
  body: string | null;
  photo_url: string | null;
  reply_to: string | null;
  is_system: boolean;
  deleted_by_admin: boolean;
  created_at: string;
  system_author_name: string | null;
};

// Onglet Chat (brief 4.3) : charge les 50 derniers messages du/des
// canal(aux) visibles, résout les auteurs et les réactions en batch, calcule
// le compteur non-lus initial, puis délègue l'affichage + le temps réel à
// ChatRoom (client).
export async function EventChat({
  eventId,
  viewerRsvpId,
  isAdmin,
  isBeneficiary,
  isBackstageHidden,
  isChatHidden,
}: {
  eventId: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  isBeneficiary: boolean;
  // Étape 5 du wizard (visibilité bénéficiaires) : les deux canaux (Général
  // ET Coulisses) étaient jusqu'ici gérés différemment ("toujours masqué"
  // pour Coulisses, "toujours accessible" pour Général, tous les deux codés
  // en dur) -- désormais configurables séparément
  // (`events.beneficiary_hidden_blocks`, blocs 'backstage'/'chat'), calculés
  // par l'appelant (page.tsx). Le chat général a été ajouté après coup
  // (retour Thomas : un bénéficiaire masqué de la liste Personnes restait
  // quand même visible comme auteur de messages dans le chat général).
  isBackstageHidden: boolean;
  isChatHidden: boolean;
}) {
  const supabase = await createClient();
  const backstageBlockedForMe = isBeneficiary && isBackstageHidden;
  const mainBlockedForMe = isBeneficiary && isChatHidden;

  const { data: beneficiaryRow } = await supabase
    .from("rsvps_public_data")
    .select("id")
    .eq("event_id", eventId)
    .eq("role", "beneficiary")
    .eq("status", "approved")
    .maybeSingle();
  // Les onglets Général ET Coulisses restent TOUJOURS affichés, y compris
  // sans aucun bénéficiaire désigné sur l'événement (bug réel signalé par
  // Thomas : "pourquoi dans le chat je ne vois plus général et l'autre ?" --
  // l'ancienne condition `hasBackstage = !!beneficiaryRow` faisait
  // disparaître la barre d'onglets ENTIÈRE dès qu'aucun bénéficiaire
  // n'existait, alors que la RLS (`messages_select`, migration
  // 20260710002200) autorise déjà la lecture/écriture du canal 'backstage' à
  // tout participant approuvé indépendamment de l'existence d'un
  // bénéficiaire -- seul `is_block_hidden_for_me` compte. `beneficiaryRow`
  // reste utile plus bas, pour savoir s'il faut résoudre des prénoms de
  // bannière.
  const hasBeneficiary = !!beneficiaryRow;

  // Bannière "X a accès" / "X n'a pas accès au fil Coulisses" (ou au chat
  // général), affichée aux AUTRES participants quand ils consultent l'onglet
  // concerné -- dans LES DEUX CAS, pas seulement quand masqué (retour
  // Thomas : "il faut le dire quand X a accès et aussi quand elle a pas
  // accès"). Jamais au(x) bénéficiaire(s) concerné(s) eux-mêmes (ils voient
  // soit le chat normal, soit le placeholder "pas d'accès", voir ChatRoom --
  // une bannière à leur propre sujet serait redondante). Prénoms via
  // `rsvps_public_data` (déjà public pour tout participant approuvé, pas
  // besoin d'être admin). Les deux canaux partagent la même liste de
  // bénéficiaires (un seul rôle 'beneficiary' par événement dans les faits),
  // une seule requête suffit pour les deux bannières.
  let beneficiaryNamesForBanners: string[] = [];
  if (hasBeneficiary && !isBeneficiary) {
    const { data: rows } = await supabase
      .from("rsvps_public_data")
      .select("first_name")
      .eq("event_id", eventId)
      .eq("role", "beneficiary")
      .eq("status", "approved");
    beneficiaryNamesForBanners = (rows ?? []).map((r) => r.first_name).filter((name): name is string => !!name);
  }
  const backstageBeneficiaryNames = beneficiaryNamesForBanners;
  const chatBeneficiaryNames = beneficiaryNamesForBanners;

  // Pas la peine de charger les messages d'un canal bloqué pour LE VIEWER
  // COURANT (RLS les rejetterait de toute façon, voir migration
  // 20260710002200) : l'onglet reste affiché (ci-dessus), mais son contenu
  // n'a rien à charger, ChatRoom y affiche directement le placeholder. Le
  // canal 'backstage' est chargé qu'un bénéficiaire existe ou non (voir
  // `hasBeneficiary` plus haut) : la RLS ne le conditionne jamais à ça.
  const visibleChannels: ("main" | "backstage")[] = [
    ...(mainBlockedForMe ? [] : (["main"] as const)),
    ...(backstageBlockedForMe ? [] : (["backstage"] as const)),
  ];

  // Position de lecture au dernier passage (brief : reprendre au premier
  // message non lu, avec une ligne de séparation) : lue ici, AVANT que
  // l'ouverture de l'onglet Chat ne mette à jour `chat_reads` côté client
  // (voir EventTabs.handleTabClick) — ce composant serveur n'est reconstruit
  // qu'au prochain chargement complet de la page, donc cette valeur reste
  // celle du dernier vrai passage, jamais écrasée par la session en cours.
  const { data: readRow } = viewerRsvpId
    ? await supabase
        .from("chat_reads")
        .select("last_read_at")
        .eq("event_id", eventId)
        .eq("rsvp_id", viewerRsvpId)
        .eq("channel", "main")
        .maybeSingle()
    : { data: null };
  const initialLastReadAt = readRow?.last_read_at ?? null;

  // Symétrique, pour le compteur non-lus PROPRE à l'onglet Coulisses (retour
  // Thomas : "il faut mettre le nombre de notif dans général et/ou
  // coulisses") -- indépendant de `initialLastReadAt` ci-dessus (qui ne sert
  // qu'à la ligne "non lus" du canal Général, jamais renommé/étendu pour ne
  // pas perturber ce mécanisme déjà réglé).
  const { data: backstageReadRow } =
    viewerRsvpId
      ? await supabase
          .from("chat_reads")
          .select("last_read_at")
          .eq("event_id", eventId)
          .eq("rsvp_id", viewerRsvpId)
          .eq("channel", "backstage")
          .maybeSingle()
      : { data: null };
  const initialBackstageLastReadAt = backstageReadRow?.last_read_at ?? null;

  const { data: messageRows } = await supabase
    .from("messages")
    .select("id, rsvp_id, channel, body, photo_url, reply_to, is_system, deleted_by_admin, created_at, system_author_name")
    .eq("event_id", eventId)
    .in("channel", visibleChannels)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<RawMessageRow[]>();

  const rows = (messageRows ?? []).slice().reverse();

  const authorIds = [...new Set(rows.map((r) => r.rsvp_id).filter((id): id is string => !!id))];
  const authorMap = new Map<string, { name: string | null; avatarUrl: string | null }>();

  if (authorIds.length > 0) {
    if (isAdmin) {
      const { data } = await supabase
        .from("rsvps")
        .select("id, first_name, last_name, avatar_kind, avatar_value")
        .in("id", authorIds);
      for (const r of data ?? []) {
        authorMap.set(r.id, {
          name: r.first_name ? `${r.first_name} ${r.last_name ?? ""}`.trim() : null,
          avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        });
      }
    } else {
      const { data } = await supabase
        .from("rsvps_public_data")
        .select("id, first_name, last_initial, avatar_kind, avatar_value")
        .in("id", authorIds);
      for (const r of data ?? []) {
        authorMap.set(r.id, {
          name: r.first_name ? `${r.first_name} ${r.last_initial ?? ""}`.trim() : null,
          avatarUrl: await resolveAvatarUrl(supabase, r.avatar_kind, r.avatar_value),
        });
      }
    }
  }

  const initialMessages: ChatMessageView[] = await Promise.all(
    rows.map(async (r) => {
      const author = r.rsvp_id ? (authorMap.get(r.rsvp_id) ?? { name: null, avatarUrl: null }) : { name: null, avatarUrl: null };
      return {
        id: r.id,
        channel: r.channel,
        body: r.body,
        photoUrl: await resolveEventPhotoUrl(supabase, r.photo_url),
        replyTo: r.reply_to,
        isSystem: r.is_system,
        deletedByAdmin: r.deleted_by_admin,
        createdAt: r.created_at,
        rsvpId: r.rsvp_id,
        authorName: author.name,
        authorAvatarUrl: author.avatarUrl,
        systemAuthorName: r.system_author_name,
      };
    }),
  );

  const messageIds = rows.map((r) => r.id);
  const initialReactions: Record<string, ChatReactionSummary[]> = {};
  if (messageIds.length > 0) {
    const { data: reactionRows } = await supabase
      .from("message_reactions")
      .select("message_id, rsvp_id, sticker_id")
      .in("message_id", messageIds);

    for (const r of reactionRows ?? []) {
      const existing = initialReactions[r.message_id] ?? [];
      const entry = existing.find((e) => e.stickerId === r.sticker_id);
      if (entry) {
        entry.count += 1;
        entry.reactedByMe = entry.reactedByMe || r.rsvp_id === viewerRsvpId;
      } else {
        existing.push({ stickerId: r.sticker_id, count: 1, reactedByMe: r.rsvp_id === viewerRsvpId });
      }
      initialReactions[r.message_id] = existing;
    }
  }

  return (
    <ChatRoom
      eventId={eventId}
      viewerRsvpId={viewerRsvpId}
      isAdmin={isAdmin}
      hideBackstageForViewer={backstageBlockedForMe}
      isBackstageHiddenForBeneficiaries={isBackstageHidden}
      backstageBeneficiaryNames={backstageBeneficiaryNames}
      hideMainForViewer={mainBlockedForMe}
      isChatHiddenForBeneficiaries={isChatHidden}
      chatBeneficiaryNames={chatBeneficiaryNames}
      initialMessages={initialMessages}
      initialReactions={initialReactions}
      initialLastReadAt={initialLastReadAt}
      initialBackstageLastReadAt={initialBackstageLastReadAt}
    />
  );
}

// Compteur non-lus initial, pour la pastille de l'onglet Chat au niveau
// page (brief 4.3, étendu -- retour Thomas : "mettre une bulle rouge à côté
// de Chat" + "faire attention que le bénéficiaire bloqué de Coulisses ne
// reçoive pas de notif dessus"). Calculé séparément de EventChat (utilisé
// depuis page.tsx, avant que le panneau Chat lui-même soit monté). Ne compte
// QUE les canaux réellement accessibles à CE viewer -- un canal bloqué pour
// lui ne contribue jamais, ni à ce total, ni (voir EventTabs) au filtre
// Realtime qui l'incrémenterait en direct.
export async function getInitialUnreadCount(
  eventId: string,
  viewerRsvpId: string | null,
  allowedChannels: ("main" | "backstage")[],
): Promise<number> {
  if (!viewerRsvpId || allowedChannels.length === 0) return 0;

  const supabase = await createClient();
  let total = 0;
  for (const channel of allowedChannels) {
    const { data: readRow } = await supabase
      .from("chat_reads")
      .select("last_read_at")
      .eq("event_id", eventId)
      .eq("rsvp_id", viewerRsvpId)
      .eq("channel", channel)
      .maybeSingle();

    let query = supabase.from("messages").select("rsvp_id").eq("event_id", eventId).eq("channel", channel);
    if (readRow?.last_read_at) {
      query = query.gt("created_at", readRow.last_read_at);
    }
    const { data } = await query;
    total += computeUnreadCount((data ?? []).map((r) => ({ rsvpId: r.rsvp_id })), viewerRsvpId);
  }

  return total;
}
