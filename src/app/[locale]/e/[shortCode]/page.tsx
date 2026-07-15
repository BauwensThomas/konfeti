import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EVENT_THEMES } from "@/lib/themes";
import { isEventOver, isJourJ } from "@/lib/event-status";
import { EventTabs } from "@/components/EventTabs";
import { EventPhotoEditor } from "@/components/EventPhotoEditor";
import { StickerConfetti } from "@/components/stickers";
import { CancelEventButton } from "@/components/CancelEventButton";
import { DatePollVoting } from "@/components/DatePollVoting";
import { GuestParticipation } from "@/components/GuestParticipation";
import { GuestPendingScreen } from "@/components/GuestPendingScreen";
import { GuestRestrictedScreen } from "@/components/GuestRestrictedScreen";
import { MyParticipationCard } from "@/components/MyParticipationCard";
import { CompanionsEditor } from "@/components/CompanionsEditor";
import { EventPersonnes } from "@/components/EventPersonnes";
import { EventChat, getInitialUnreadCount } from "@/components/EventChat";
import { BringList } from "@/components/BringList";
import { PollsList } from "@/components/PollsList";
import { ParticiperTabs } from "@/components/ParticiperTabs";
import { PotContribution } from "@/components/PotContribution";
import { PotAdminDashboard } from "@/components/pot/PotAdminDashboard";
import { PotConnectionBanner } from "@/components/pot/PotConnectionBanner";
import { EventWeather } from "@/components/EventWeather";
import { shouldShowWeather } from "@/lib/weather";
import { BringAccueilGauges } from "@/components/bring/BringAccueilGauges";
import { PollsAccueilSummary } from "@/components/polls/PollsAccueilSummary";
import { PollsQuotaWarningSection } from "@/components/polls/PollsQuotaWarningSection";
import { JourJCard } from "@/components/JourJCard";
import { ArrivalInfoBlock } from "@/components/ArrivalInfoBlock";
import { EndEventButton } from "@/components/EndEventButton";
import { EventFinishedCard } from "@/components/EventFinishedCard";
import { GoHomeCard } from "@/components/GoHomeCard";
import { ShareEventButton } from "@/components/ShareEventButton";
import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { joinNames } from "@/lib/joinNames";
import type { BringUnit } from "@/lib/bring-units";

// Open Graph dynamique (brief 5.7/Phase 3) : le titre/aperçu de partage
// reflète l'événement (titre réel), mais ne se base QUE sur `events_public_data`
// (titre + thème seulement), jamais sur la ligne `events` complète : un lien
// partagé peut être "unfurl" par un bot (WhatsApp, Messenger...) sans jamais
// passer par une session authentifiée, donc sans plus de droits qu'un
// visiteur non connecté (brief 1.3). `robots: noindex` : jamais indexé par un
// moteur de recherche (le vrai `robots.txt`, Phase 6, le confirmera aussi).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}): Promise<Metadata> {
  const { shortCode } = await params;
  const supabase = await createClient();
  const { data: preview } = await supabase
    .from("events_public_data")
    .select("title")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (!preview) {
    return { robots: { index: false, follow: false } };
  }

  const t = await getTranslations("EventPage");
  const ogImage = `/api/og/${shortCode}`;

  return {
    title: preview.title,
    description: t("ogDescription"),
    robots: { index: false, follow: false },
    openGraph: {
      title: preview.title,
      description: t("ogDescription"),
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: preview.title,
      description: t("ogDescription"),
      images: [ogImage],
    },
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ shortCode: string }>;
}) {
  const { shortCode } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La policy RLS ne renvoie une ligne ici que si on est l'hôte, un admin, ou
  // un participant approuvé de cet événement (voir private.is_event_admin /
  // is_event_approved_participant). Sinon `event` reste null, sans erreur.
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (event) {
    const isHost = event.host_id === user?.id;

    // L'hôte est toujours admin de droit (bypass déjà géré côté RLS par
    // is_event_admin/is_event_approved_participant, voir private.is_event_host),
    // mais sa ligne rsvps reste créée paresseusement (ensure_own_rsvp,
    // jusqu'ici seulement appelée depuis le chat) : sans elle, l'hôte
    // n'apparaissait jamais dans l'onglet Personnes pour un événement tout
    // juste créé. On la garantit ici, à chaque chargement de page, avant de
    // lire la ligne — pour l'hôte comme pour tout autre participant, la
    // ligne rsvps du viewer sert à la fois au calcul du rôle (Personnes,
    // masquage cagnotte bénéficiaire) et au contrôle "changer ma réponse"/
    // "quitter" sur l'Accueil (brief 1.3/1.5).
    if (isHost && user) {
      await supabase.rpc("ensure_own_rsvp", { p_event_id: event.id });
    }
    const { data: myRsvpRow } = user
      ? await supabase
          .from("rsvps")
          .select("id, role, answer, checked_in_at, arrived_home_at")
          .eq("event_id", event.id)
          .eq("profile_id", user.id)
          .maybeSingle()
      : { data: null };

    // Accompagnants de la propre ligne du viewer (retour Thomas : pouvoir en
    // rajouter/retirer après l'inscription, pas seulement à l'inscription).
    const { data: myCompanionRows } = myRsvpRow
      ? await supabase.from("companions").select("id, kind, first_name").eq("rsvp_id", myRsvpRow.id).order("id")
      : { data: null };

    // Engagements déjà pris par le viewer (retour Thomas : "quand on clic sur
    // supprimer un accompagnant, si l'utilisateur a rajouté des produits à
    // ramener ou répondu à des sondages, qu'on demande qu'est-ce qu'il faut
    // retirer") -- affichés dans `CompanionsEditor` au moment précis du
    // retrait, pour ajuster en un geste plutôt que de laisser un
    // dépassement de quota découvert plus tard.
    const { data: myClaimRows } = myRsvpRow
      ? await supabase
          .from("bring_claims")
          .select("id, item_id, quantity, bring_items(label, unit)")
          .eq("rsvp_id", myRsvpRow.id)
          .returns<{ id: string; item_id: string; quantity: number; bring_items: { label: string; unit: BringUnit } | null }[]>()
      : { data: null };
    const { data: myVoteRows } = myRsvpRow
      ? await supabase
          .from("poll_votes")
          .select("option_id, quantity, poll_options(label, poll_id, polls(question))")
          .eq("rsvp_id", myRsvpRow.id)
          .returns<
            {
              option_id: string;
              quantity: number;
              poll_options: { label: string; poll_id: string; polls: { question: string } | null } | null;
            }[]
          >()
      : { data: null };

    const isAdmin = isHost || myRsvpRow?.role === "admin";
    const isBeneficiary = myRsvpRow?.role === "beneficiary";

    // Étape 5 du wizard (visibilité bénéficiaires, retour Thomas) : la
    // cagnotte et les deux canaux de chat (Général/Coulisses) sont désormais
    // configurables (plus jamais "toujours masqués"/"toujours accessible"
    // codés en dur) via ce même tableau que bring/polls/playlist. Le chat
    // GÉNÉRAL a été ajouté après coup (retour Thomas : un bénéficiaire masqué
    // de la liste Personnes restait quand même visible comme auteur de
    // messages dans le chat général). La liste Personnes, elle, n'a pas de
    // policy RLS dédiée (rsvps_public_data sert aussi à résoudre les noms
    // d'auteur dans le chat, la restreindre casserait ça pour tout le
    // monde) : masquage purement applicatif ici, protection plus légère que
    // les autres blocs, assumé (voir migration 20260710002200).
    const hiddenBlocks = event.beneficiary_hidden_blocks ?? [];
    // Réglage de l'ÉVÉNEMENT (pas encore filtré par le viewer courant) :
    // EventChat a besoin de cette valeur BRUTE pour tout le monde (y compris
    // un admin non-bénéficiaire), afin de savoir s'il doit afficher la
    // bannière "X n'a pas accès" -- c'est EventChat lui-même qui combine
    // ensuite avec SA PROPRE notion de `isBeneficiary` pour déterminer si LE
    // VIEWER COURANT est celui qui est bloqué. Un bug réel est passé par ici
    // : calculer `isBeneficiary && hiddenBlocks.includes(...)` À CET ENDROIT
    // renvoyait toujours `false` pour un non-bénéficiaire (l'admin, censé
    // voir la bannière), quel que soit le réglage réel de l'événement.
    const isBackstageHiddenForBeneficiaries = hiddenBlocks.includes("backstage");
    const isChatHiddenForBeneficiaries = hiddenBlocks.includes("chat");
    const isParticipantsHiddenForBeneficiaries = hiddenBlocks.includes("participants");
    const isParticipantsListHidden = isBeneficiary && isParticipantsHiddenForBeneficiaries;
    // "Qui apporte quoi" (brief 4.4) : même pattern que Personnes -- masquage
    // purement applicatif (pas de policy RLS dédiée sur bring_items/
    // bring_claims au-delà de is_block_hidden_for_me déjà en place depuis la
    // Phase 1), le bloc `bring` existait déjà dans le tableau, seule l'UI
    // manquait jusqu'ici.
    const isBringHiddenForBeneficiaries = hiddenBlocks.includes("bring");
    const isBringListHidden = isBeneficiary && isBringHiddenForBeneficiaries;
    // Sondages : même masquage purement applicatif que "qui apporte quoi"
    // juste au-dessus.
    const arePollsHiddenForBeneficiaries = hiddenBlocks.includes("polls");
    const isPollsListHidden = isBeneficiary && arePollsHiddenForBeneficiaries;

    // Retour Thomas : l'organisateur ou le porteur d'une cagnotte active qui
    // répond "je ne peux pas" reste admin invisible (voir `update_my_answer`)
    // -- mais ne doit alors plus pouvoir ajouter d'accompagnants (il ne
    // participe pas), ni voir les 2 canaux de chat (aucune raison de suivre
    // une discussion pour un événement où il ne vient pas). Il garde en
    // revanche ses droits de modération (sondages/qui apporte quoi), gérés
    // par `isAdmin` ailleurs, jamais touché ici.
    const isPotOwnerOfActivePot = event.pot_owner === (user?.id ?? null) && event.pot_enabled && !event.pot_closed_at;
    const viewerAnsweredNoStillAdmin = (isHost || isPotOwnerOfActivePot) && myRsvpRow?.answer === "no";
    // Pour le message affiché AVANT confirmation (donc indépendant de la
    // réponse actuelle, contrairement à `viewerAnsweredNoStillAdmin`
    // ci-dessus) : lequel des deux motifs s'applique à ce viewer.
    const staysInEventReason: "host" | "pot_owner" | null = isHost ? "host" : isPotOwnerOfActivePot ? "pot_owner" : null;

    // Canaux de chat réellement accessibles à CE viewer (retour Thomas :
    // pastille non-lus par canal, sans jamais notifier un bénéficiaire
    // bloqué d'une activité qu'il ne peut pas voir) -- même formule que
    // `EventChat.tsx` (isBeneficiary && le bloc concerné est masqué), utilisée
    // ici pour le compteur initial ET le filtre Realtime de `EventTabs`.
    // Jamais aucun canal pour qui a répondu "non" tout en restant admin.
    const chatAllowedChannels: ("main" | "backstage")[] = viewerAnsweredNoStillAdmin
      ? []
      : [
          ...(isBeneficiary && isChatHiddenForBeneficiaries ? [] : (["main"] as const)),
          ...(isBeneficiary && isBackstageHiddenForBeneficiaries ? [] : (["backstage"] as const)),
        ];

    // Prénoms des bénéficiaires approuvés (retour Thomas : "X a accès ou X
    // n'a pas accès, ça sera plus simple" -- même principe partout où un
    // bloc peut être masqué). Public via `rsvps_public_data`, pas besoin
    // d'être admin pour voir le prénom d'un bénéficiaire.
    const { data: beneficiaryRows } = await supabase
      .from("rsvps_public_data")
      .select("first_name")
      .eq("event_id", event.id)
      .eq("role", "beneficiary")
      .eq("status", "approved");
    const beneficiaryNames = (beneficiaryRows ?? [])
      .map((r) => r.first_name)
      .filter((name): name is string => !!name);

    // La pastille "Personnes" compte tout ce qui requiert une vraie décision
    // de l'admin (retour Thomas) : les demandes "pending" classiques, PLUS
    // les participants restreints ("je ne peux pas") ayant explicitement
    // demandé à participer à la cagnotte et pas encore autorisés — pas les
    // restricted qui n'ont rien demandé (aucune décision à prendre pour eux).
    let pendingCount = 0;
    if (isAdmin) {
      const { count } = await supabase
        .from("rsvps")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .or(
          "status.eq.pending,and(status.eq.restricted,wants_pot_access.eq.true,pot_access_granted.eq.false)",
        );
      pendingCount = count ?? 0;
    }

    // Pastille "Participer" (brief 4.4, retour Thomas : "une notif rouge sur
    // participer comme pour personnes") : items "qui apporte quoi" proposés
    // par un invité, en attente de validation admin -- même pattern que
    // `pendingCount` ci-dessus.
    let pendingBringCount = 0;
    if (isAdmin) {
      const { count } = await supabase
        .from("bring_items")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("status", "pending");
      pendingBringCount = count ?? 0;
    }

    // Cagnotte (Phase 7, brief 4.5) : derrière le feature flag `pot` (pas
    // encore activé en général, Thomas pourra le faire depuis /admin une
    // fois prêt à tester) ET jamais montrée à un bénéficiaire (brief 1.4 :
    // "toujours masquée... ni montant, ni contributeurs, ni existence" --
    // contrairement à bring/polls/chat, aucun mode "masqué mais visible
    // qu'il y a quelque chose").
    let potFeatureEnabled = false;
    let potCollectedCents = 0;
    // Retour Thomas : plutôt que le total cumulé (trop d'infos d'un coup,
    // pression sociale sur l'Accueil que tout le monde voit en premier), un
    // simple "+X€ le JJ/MM" sur le DERNIER paiement reçu -- crée un peu de
    // dynamisme sans exposer ni le total ni qui a donné (jamais de nom ici).
    let lastContributionNetCents: number | null = null;
    let lastContributionAt: string | null = null;
    if (event.pot_enabled && !isBeneficiary) {
      const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "pot").maybeSingle();
      potFeatureEnabled = !!flag?.enabled;

      if (potFeatureEnabled) {
        const { data: succeededContributions } = await supabase
          .from("pot_contributions")
          .select("net_cents")
          .eq("event_id", event.id)
          .eq("status", "succeeded");
        potCollectedCents = (succeededContributions ?? []).reduce((sum, c) => sum + (c.net_cents ?? 0), 0);

        const { data: lastContribution } = await supabase
          .from("pot_contributions")
          .select("net_cents, created_at")
          .eq("event_id", event.id)
          .eq("status", "succeeded")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastContributionNetCents = lastContribution?.net_cents ?? null;
        lastContributionAt = lastContribution?.created_at ?? null;
      }
    }

    // Statut de connexion Stripe (retour Thomas : bannière Accueil + badge
    // Personnes) -- réservé au porteur de la cagnotte lui-même, jamais aux
    // autres admins (ni le statut connecté/non connecté, ni même le fait
    // qu'on regarde sa ligne différemment). Calculé une seule fois ici,
    // partagé entre `EventAccueil` et `EventPersonnes` plutôt que refait dans
    // chacun.
    const viewerIsPotOwner = potFeatureEnabled && !!user && event.pot_owner === user.id;
    let potOwnerStripeConnected = false;
    if (viewerIsPotOwner) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("stripe_onboarding_complete")
        .eq("id", event.pot_owner)
        .maybeSingle();
      potOwnerStripeConnected = !!ownerProfile?.stripe_onboarding_complete;
    }

    // Sondages proposés par un invité, en attente de validation admin --
    // même pattern que `pendingBringCount` ci-dessus.
    let pendingPollsCount = 0;
    if (isAdmin) {
      const { count } = await supabase
        .from("polls")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("status", "pending");
      pendingPollsCount = count ?? 0;
    }

    const initialUnreadCount = await getInitialUnreadCount(event.id, myRsvpRow?.id ?? null, chatAllowedChannels);

    let dateOptions: {
      id: string;
      startsAt: string;
      label: string | null;
      voteCount: number;
      votedByMe: boolean;
    }[] = [];

    if (event.date_mode === "poll") {
      const { data: options } = await supabase
        .from("date_options")
        .select("id, starts_at, label")
        .eq("event_id", event.id)
        .order("starts_at");

      if (options && options.length > 0) {
        const { data: votes } = await supabase
          .from("date_votes")
          .select("option_id, rsvp_id")
          .in(
            "option_id",
            options.map((o) => o.id),
          );

        const { data: myRsvp } = user
          ? await supabase
              .from("rsvps")
              .select("id")
              .eq("event_id", event.id)
              .eq("profile_id", user.id)
              .maybeSingle()
          : { data: null };

        dateOptions = options.map((option) => {
          const optionVotes = votes?.filter((v) => v.option_id === option.id) ?? [];
          return {
            id: option.id,
            startsAt: option.starts_at,
            label: option.label,
            voteCount: optionVotes.length,
            votedByMe: !!myRsvp && optionVotes.some((v) => v.rsvp_id === myRsvp.id),
          };
        });
      }
    }

    const coverPhotoUrl = event.cover_photo_path
      ? (
          await supabase.storage
            .from("event-photos")
            .createSignedUrl(event.cover_photo_path, 3600)
        ).data?.signedUrl ?? null
      : null;
    const t = await getTranslations("EventPage");
    // Bouton Partager (brief 4.2) : visible de tout admin (host ou promu),
    // et de tout participant approuvé si l'hôte a choisi "tous" (share_policy)
    // plutôt que "admins seulement". `isHost || share_policy==='all'` oubliait
    // qu'un admin PROMU (pas l'hôte) doit aussi voir ce bouton quand la
    // politique est "admins" (retour Thomas : un admin promu n'y avait pas accès).
    const canShare = isAdmin || event.share_policy === "all";
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${event.short_code}`;

    return (
      <main className="flex flex-1 flex-col items-center gap-6 px-6 py-8 sm:py-12">
        {/* "Retour à mes événements" retiré (demande de Thomas) : la flèche
            retour du header global couvre désormais ce besoin pour tout
            utilisateur connecté. Partager/Export/Modifier/Supprimer regroupés
            dans une seule rangée de bulles, chacune dans une couleur
            distincte (Partager en jaune déjà via ShareEventButton, Export PDF
            en bleu ciel placé avant Modifier, Modifier en orange foncé,
            Supprimer en corail, icône seule -- toutes les couleurs sur
            retour Thomas). */}
        {(canShare || isAdmin) && (
          <div className="flex w-full max-w-lg lg:max-w-2xl flex-wrap items-center justify-center gap-3">
            {canShare && (
              <ShareEventButton title={event.title} url={shareUrl} shortCode={event.short_code} />
            )}
            {isAdmin && (
              <>
                {/* Export PDF (brief 4.13), réservé aux admins, généré à la
                    volée (`/api/export/[shortCode]`) -- lien direct plutôt
                    qu'un Server Action, pour laisser le navigateur gérer le
                    téléchargement nativement (`content-disposition`). PDF
                    plutôt que CSV (retour Thomas : tout le monde ne sait pas
                    utiliser un CSV sur son téléphone). */}
                <a
                  href={`/api/export/${event.short_code}`}
                  download={`participants-${event.short_code}.pdf`}
                  className={buttonClassName({ variant: "sky", size: "sm", className: "h-11" })}
                >
                  {t("exportPdf")}
                </a>
                <Link
                  href={`/e/${event.short_code}/modifier`}
                  className={buttonClassName({ variant: "highlightDark", size: "sm", className: "h-11" })}
                >
                  {t("editEvent")}
                </Link>
                <CancelEventButton eventId={event.id} />
              </>
            )}
          </div>
        )}
        <EventTabs
          accueil={
            <EventAccueil
              event={event}
              isHost={isHost}
              isAdmin={isAdmin}
              isBeneficiary={isBeneficiary}
              viewerIsPotOwner={viewerIsPotOwner}
              potOwnerStripeConnected={potOwnerStripeConnected}
              viewerAnsweredNoStillAdmin={viewerAnsweredNoStillAdmin}
              staysInEventReason={staysInEventReason}
              potCollectedCents={potCollectedCents}
              lastContributionNetCents={lastContributionNetCents}
              lastContributionAt={lastContributionAt}
              dateOptions={dateOptions}
              coverPhotoUrl={coverPhotoUrl}
              beneficiaryNames={beneficiaryNames}
              isBringListHidden={isBringListHidden}
              isPollsListHidden={isPollsListHidden}
              // Retour Thomas : "pourquoi je ne vois pas le choix dans la
              // page d'accueil ?" -- `!isHost` excluait auparavant l'hôte de
              // cette carte (on supposait l'organisateur "évidemment
              // présent"), mais ça bloque désormais la vraie fonctionnalité
              // "je ne peux pas" tout en restant admin invisible (voir
              // `update_my_answer`/`MyParticipationCard.tsx`) -- l'hôte doit
              // pouvoir choisir sa réponse comme n'importe qui d'autre.
              myRsvp={
                myRsvpRow
                  ? {
                      id: myRsvpRow.id,
                      answer: myRsvpRow.answer as "yes" | "maybe" | "no",
                      checkedInAt: myRsvpRow.checked_in_at,
                      arrivedHomeAt: myRsvpRow.arrived_home_at,
                    }
                  : null
              }
              viewerRsvpId={myRsvpRow?.id ?? null}
              viewerCompanions={(myCompanionRows ?? []).map((c) => ({
                id: c.id,
                kind: c.kind as "partner" | "child" | "friend" | "family",
                firstName: c.first_name,
              }))}
              // Même garde que `viewerCompanions` juste au-dessus (pas gaté
              // par `!isHost`) : sert uniquement à alimenter le récapitulatif
              // "qu'est-ce qu'il faut retirer" de `CompanionsEditor`.
              viewerClaims={(myClaimRows ?? [])
                .filter((c) => c.bring_items)
                .map((c) => ({
                  itemId: c.item_id,
                  label: c.bring_items!.label,
                  unit: c.bring_items!.unit,
                  quantity: c.quantity,
                }))}
              viewerVotes={(myVoteRows ?? [])
                .filter((v) => v.poll_options?.polls)
                .map((v) => ({
                  optionId: v.option_id,
                  pollId: v.poll_options!.poll_id,
                  pollQuestion: v.poll_options!.polls!.question,
                  optionLabel: v.poll_options!.label,
                  quantity: v.quantity,
                }))}
            />
          }
          personnes={
            isParticipantsListHidden ? (
              <Card className="text-center text-sm text-foreground/60">
                {t("participantsListHidden")}
              </Card>
            ) : (
              <EventPersonnes
                eventId={event.id}
                shortCode={event.short_code}
                viewerRsvpId={myRsvpRow?.id ?? null}
                isAdmin={isAdmin}
                isHost={isHost}
                hostProfileId={event.host_id}
                potEnabled={event.pot_enabled}
                isBeneficiary={isBeneficiary}
                isParticipantsHidden={isParticipantsHiddenForBeneficiaries}
                beneficiaryNames={beneficiaryNames}
                // Retour Thomas : "j'ai eu bien rentré mais dans personnes je
                // ne vois pas... avec un v vert" -- l'événement était déjà
                // "Terminé" (isJourJ redevenu faux), donc les badges
                // Arrivé/Bien rentré disparaissaient à tort. Même fenêtre
                // élargie que `GoHomeCard` (isJourJ || isEventOver) : ces
                // badges doivent rester visibles tant qu'on peut encore
                // cocher "bien rentré" (GoHomeCard.tsx), pas seulement
                // pendant le Mode Jour J strict.
                isJourJ={
                  isJourJ(event.starts_at, event.date_mode, event.ends_at, event.ended_at) ||
                  isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at)
                }
                viewerIsPotOwner={viewerIsPotOwner}
                potOwnerStripeConnected={potOwnerStripeConnected}
              />
            )
          }
          pendingCount={pendingCount}
          pendingBringCount={pendingBringCount}
          pendingPollsCount={pendingPollsCount}
          chat={
            // Retour Thomas : quelqu'un qui a dit "je ne peux pas" (tout en
            // restant admin invisible) n'a aucune raison de suivre une
            // discussion pour un événement où il ne vient pas.
            viewerAnsweredNoStillAdmin ? (
              <Card className="text-center text-sm text-foreground/60">{t("chatHiddenNotAttending")}</Card>
            ) : (
              <EventChat
                eventId={event.id}
                viewerRsvpId={myRsvpRow?.id ?? null}
                isAdmin={isAdmin}
                isBeneficiary={isBeneficiary}
                isBackstageHidden={isBackstageHiddenForBeneficiaries}
                isChatHidden={isChatHiddenForBeneficiaries}
              />
            )
          }
          participer={
            <ParticiperTabs
              pendingPollsCount={pendingPollsCount}
              pendingBringCount={pendingBringCount}
              sondages={
                isPollsListHidden ? (
                  <Card className="text-center text-sm text-foreground/60">{t("pollsListHidden")}</Card>
                ) : (
                  <PollsList
                    eventId={event.id}
                    shortCode={event.short_code}
                    viewerRsvpId={myRsvpRow?.id ?? null}
                    isAdmin={isAdmin}
                    readOnly={isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at)}
                    hideApprovedList={viewerAnsweredNoStillAdmin}
                  />
                )
              }
              bring={
                isBringListHidden ? (
                  <Card className="text-center text-sm text-foreground/60">{t("bringListHidden")}</Card>
                ) : (
                  <BringList
                    eventId={event.id}
                    shortCode={event.short_code}
                    viewerRsvpId={myRsvpRow?.id ?? null}
                    isAdmin={isAdmin}
                    readOnly={isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at)}
                    hideApprovedList={viewerAnsweredNoStillAdmin}
                  />
                )
              }
              cagnotte={
                potFeatureEnabled ? (
                  <div className="flex flex-col gap-4">
                    <PotContribution
                      eventId={event.id}
                      label={event.pot_label}
                      mode={event.pot_mode as "goal" | "open"}
                      goalCents={event.pot_goal_cents}
                      collectedCents={potCollectedCents}
                      closedAt={event.pot_closed_at}
                    />
                    {isAdmin && (
                      <PotAdminDashboard eventId={event.id} potOwnerId={event.pot_owner} viewerId={user?.id ?? null} />
                    )}
                  </div>
                ) : null
              }
            />
          }
          eventId={event.id}
          viewerRsvpId={myRsvpRow?.id ?? null}
          initialUnreadCount={initialUnreadCount}
          chatAllowedChannels={chatAllowedChannels}
        />
      </main>
    );
  }

  // Pas d'accès complet : on retombe sur l'aperçu public (titre + thème
  // seulement, brief 1.3), qui ne fuite jamais rien d'autre à un visiteur
  // non validé.
  const { data: preview } = await supabase
    .from("events_public_data")
    .select("id, short_code, title, theme, allow_companions, pot_enabled")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (!preview) notFound();

  const t = await getTranslations("EventPage");
  const theme = EVENT_THEMES.find((th) => th.key === preview.theme) ?? EVENT_THEMES[0];

  // La ligne rsvps brute reste lisible par son propriétaire même quand la
  // policy RLS d'`events` ne renvoie encore rien (rsvps_select_own_or_admin
  // n'exige pas d'être approuvé, contrairement à events_select_full_for_participants).
  const { data: myRsvp } = user
    ? await supabase
        .from("rsvps")
        .select("id, status, answer, pot_access_granted, wants_pot_access")
        .eq("event_id", preview.id)
        .eq("profile_id", user.id)
        .maybeSingle()
    : { data: null };

  // Accès restreint "cagnotte seule" (brief 1.3) : infos cagnotte via la
  // table miroir dédiée. N'importe qui répondant "je ne peux pas" y avait
  // accès instantanément, sans validation (retour Thomas, question directe) —
  // durci : ne s'affiche désormais qu'après que l'admin ait explicitement
  // autorisé cet accès (`grant_pot_access`), la policy RLS l'exige aussi
  // (`private.has_pot_access`), pas seulement ce filtre applicatif.
  // Retour Thomas : "aucun moyen de faire un paiement" -- `pot_owner`/
  // `pot_closed_at` ajoutés à ce mirror (avant, seul le libellé/l'objectif
  // étaient exposés, jamais de quoi router un vrai paiement).
  const { data: potInfo } =
    myRsvp?.status === "restricted" && myRsvp.pot_access_granted
      ? await supabase
          .from("events_pot_data")
          .select("pot_enabled, pot_mode, pot_goal_cents, pot_label, pot_owner, pot_closed_at")
          .eq("id", preview.id)
          .maybeSingle()
      : { data: null };

  let potFeatureEnabledForRestricted = false;
  let potCollectedCentsForRestricted = 0;
  if (potInfo?.pot_enabled) {
    const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "pot").maybeSingle();
    potFeatureEnabledForRestricted = !!flag?.enabled;
    if (potFeatureEnabledForRestricted) {
      const { data: succeededContributions } = await supabase
        .from("pot_contributions")
        .select("net_cents")
        .eq("event_id", preview.id)
        .eq("status", "succeeded");
      potCollectedCentsForRestricted = (succeededContributions ?? []).reduce((sum, c) => sum + (c.net_cents ?? 0), 0);
    }
  }

  const { data: myProfile } = user
    ? await supabase
        .from("profiles")
        .select("first_name, last_name, phone, gender, avatar_kind, avatar_value")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16 text-center sm:py-24">
      <div
        className="flex w-full max-w-sm lg:max-w-md flex-col items-center gap-4 rounded-konfeti p-8 shadow-konfeti"
        style={{
          background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        }}
      >
        <Image
          src="/mascot.webp"
          alt="La mascotte Konfeti"
          width={120}
          height={120}
          priority
          className="w-24"
        />
        <h1 className="font-display text-2xl font-bold text-white">{preview.title}</h1>
      </div>
      <p className="max-w-sm lg:max-w-md text-sm text-foreground/70">{t("previewNotice")}</p>

      {myRsvp?.status === "restricted" ? (
        <GuestRestrictedScreen
          rsvpId={myRsvp.id}
          eventId={preview.id}
          shortCode={preview.short_code}
          currentAnswer={myRsvp.answer as "yes" | "maybe" | "no"}
          potEnabled={preview.pot_enabled}
          wantsPotAccess={myRsvp.wants_pot_access}
          potAccessGranted={myRsvp.pot_access_granted}
          pot={potInfo}
          potFeatureEnabled={potFeatureEnabledForRestricted}
          potCollectedCents={potCollectedCentsForRestricted}
        />
      ) : myRsvp && myRsvp.status !== "left" && myRsvp.status !== "removed" ? (
        <GuestPendingScreen
          rsvpId={myRsvp.id}
          shortCode={preview.short_code}
          currentAnswer={myRsvp.answer as "yes" | "maybe" | "no"}
        />
      ) : (
        // Statut "left"/"removed" (parti ou retiré) : traité comme "aucune
        // participation" pour cet écran — le formulaire d'identité classique
        // s'affiche à nouveau. `create_own_rsvp` reconnaît alors l'ancienne
        // ligne (même compte, même événement) et la réactive plutôt que
        // d'en créer une seconde (retour Thomas : revenir doit restaurer le
        // nom sur l'historique de chat déjà lié à ce participant).
        <GuestParticipation
          eventId={preview.id}
          shortCode={preview.short_code}
          allowCompanions={preview.allow_companions}
          hasSession={!!user}
          initial={
            myProfile && myProfile.first_name
              ? {
                  firstName: myProfile.first_name ?? "",
                  lastName: myProfile.last_name ?? "",
                  phone: myProfile.phone ?? "",
                  gender: (myProfile.gender as "female" | "male" | null) ?? null,
                  avatarKind: (myProfile.avatar_kind as "preset" | "photo") ?? "preset",
                  avatarValue: myProfile.avatar_value ?? null,
                }
              : null
          }
        />
      )}
    </main>
  );
}

type EventRow = {
  id: string;
  short_code: string;
  title: string;
  description: string | null;
  theme: string;
  date_mode: "fixed" | "poll";
  starts_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  location_text: string | null;
  location_lat: number | null;
  location_lng: number | null;
  cover_photo_path: string | null;
  occasion: string | null;
  birthday_person: string | null;
  birthday_age: number | null;
  show_age: boolean;
  housewarming_hosts: string[] | null;
  bachelor_person: string | null;
  instructions: string | null;
  dress_code: string | null;
  bring_general: string | null;
  rsvp_deadline: string | null;
  kids_allowed: "yes" | "no" | "details" | null;
  pets_allowed: "yes" | "no" | "details" | null;
  allow_companions: boolean;
  pot_enabled: boolean;
  pot_mode: "goal" | "open";
  pot_goal_cents: number | null;
  pot_closed_at: string | null;
  pot_label: string | null;
  host_id: string;
  share_policy: "all" | "admins";
  beneficiary_hidden_blocks: string[];
};

async function EventAccueil({
  event,
  isHost,
  isAdmin,
  isBeneficiary,
  viewerIsPotOwner,
  potOwnerStripeConnected,
  viewerAnsweredNoStillAdmin,
  staysInEventReason,
  lastContributionNetCents,
  lastContributionAt,
  potCollectedCents,
  dateOptions,
  coverPhotoUrl,
  beneficiaryNames,
  myRsvp,
  isBringListHidden,
  isPollsListHidden,
  viewerRsvpId,
  viewerCompanions,
  viewerClaims,
  viewerVotes,
}: {
  event: EventRow;
  isHost: boolean;
  isAdmin: boolean;
  isBeneficiary: boolean;
  // Retour Thomas : statut de connexion Stripe affiché juste sous la
  // bannière, réservé au porteur de la cagnotte lui-même (voir le calcul
  // partagé dans le composant parent).
  viewerIsPotOwner: boolean;
  potOwnerStripeConnected: boolean;
  // Retour Thomas : organisateur/porteur de cagnotte ayant répondu "je ne
  // peux pas" -- reste admin invisible, mais ne doit plus voir les
  // accompagnants ni le chat (voir le calcul partagé dans le parent).
  viewerAnsweredNoStillAdmin: boolean;
  staysInEventReason: "host" | "pot_owner" | null;
  // Retour Thomas : "+X€ le JJ/MM" sur le dernier paiement reçu, affiché
  // dans la carte cagnotte de l'Accueil -- `null` s'il n'y a encore aucune
  // contribution réussie.
  lastContributionNetCents: number | null;
  lastContributionAt: string | null;
  // Retour Thomas : "quand on choisit un objectif, il faut une barre verte
  // comme qui apporte quoi" -- total cumulé, utilisé UNIQUEMENT pour la
  // jauge en mode "goal" (jamais affiché en chiffre brut par ailleurs sur
  // l'Accueil, voir la discussion sur la pression sociale).
  potCollectedCents: number;
  dateOptions: {
    id: string;
    startsAt: string;
    label: string | null;
    voteCount: number;
    votedByMe: boolean;
  }[];
  coverPhotoUrl: string | null;
  // Étape 5 du wizard (retour Thomas : "X a accès ou X n'a pas accès, ça
  // sera plus simple") : prénoms des bénéficiaires approuvés, pour la note
  // dans la carte cagnotte (visible par tout le monde SAUF le bénéficiaire
  // concerné, qui ne voit de toute façon jamais cette carte -- voir la garde
  // juste au-dessus).
  beneficiaryNames: string[];
  myRsvp: {
    id: string;
    answer: "yes" | "maybe" | "no";
    checkedInAt: string | null;
    arrivedHomeAt: string | null;
  } | null;
  // "Qui apporte quoi" (brief 4.4, retour Thomas : "dès que quelqu'un a
  // rajouté un produit, on a un histogramme en barre à côté... sur la page
  // d'accueil") -- même garde-fou de masquage que le reste (jamais montré au
  // bénéficiaire concerné).
  isBringListHidden: boolean;
  // Sondages (retour Thomas : "il ne faut pas mettre les sondages sur
  // l'accueil ?") -- même principe que `isBringListHidden` juste au-dessus.
  isPollsListHidden: boolean;
  // Mode Jour J (brief 4.11) : id de la propre ligne rsvps du viewer courant,
  // y compris pour l'hôte (contrairement à `myRsvp` ci-dessus, `null` pour
  // lui volontairement -- voir son commentaire) -- nécessaire pour que
  // n'importe qui, hôte compris, puisse se check-in.
  viewerRsvpId: string | null;
  // Accompagnants de la propre ligne du viewer, y compris l'hôte -- même
  // logique que `viewerRsvpId` juste au-dessus (retour Thomas : l'hôte doit
  // aussi pouvoir rajouter ses propres +1 à sa fête).
  viewerCompanions: { id: string; kind: "partner" | "child" | "friend" | "family"; firstName: string | null }[];
  // Engagements du viewer (retour Thomas : "que faut-il retirer" au moment
  // de retirer un accompagnant) -- voir `CompanionsEditor`.
  viewerClaims: { itemId: string; label: string; unit: BringUnit; quantity: number }[];
  viewerVotes: { optionId: string; pollId: string; pollQuestion: string; optionLabel: string; quantity: number }[];
}) {
  const t = await getTranslations("EventPage");
  const tOccasions = await getTranslations("Occasions");
  const theme = EVENT_THEMES.find((th) => th.key === event.theme) ?? EVENT_THEMES[0];

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center gap-4 rounded-konfeti p-6 text-white shadow-konfeti"
        style={{
          background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {isHost && (
              <span className="w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                {t("hostBadge")}
              </span>
            )}
            {/* Retour Thomas : sur l'Accueil, un admin promu (pas l'hôte) n'a
                aucun badge équivalent à "Tu es l'organisateur" -- ajouté en
                miroir, même style, juste réservé à isAdmin && !isHost pour ne
                jamais doubler avec le badge organisateur. */}
            {isAdmin && !isHost && (
              <span className="w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                {t("adminBadge")}
              </span>
            )}
            {/* Pas affiché tant que le Mode Jour J prolongé est encore actif
                (retour Thomas : "il faut enlever le terminé dans la bannière
                aussi non ?") -- contradictoire d'afficher "Terminé" alors que
                la carte Jour J (arrivées, bien rentré) est encore utile. */}
            {isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at) ? (
              <span className="w-fit rounded-full bg-accent-coral px-3 py-1 text-xs font-semibold text-white">
                {t("finishedBadge")}
              </span>
            ) : (
              // Retour Thomas : "dans la bannière aussi il doit avoir mis en
              // cours ou terminé selon le moment" -- même badge de statut
              // temporel que "Mes événements", pendant le Mode Jour J
              // (jour de la fête + fin + jours de grâce).
              isJourJ(event.starts_at, event.date_mode, event.ends_at, event.ended_at) && (
                <span className="w-fit rounded-full bg-accent-mint px-3 py-1 text-xs font-semibold text-white">
                  {t("ongoingBadge")}
                </span>
              )
            )}
          </div>
          <h1 className="font-display text-2xl font-bold">{event.title}</h1>
          {event.occasion && <p className="text-sm text-white/90">{tOccasions(event.occasion)}</p>}
        </div>

        <EventPhotoEditor eventId={event.id} isHost={isHost} initialPhotoUrl={coverPhotoUrl} />
      </div>

      {/* Retour Thomas : statut de connexion Stripe juste sous la bannière,
          réservé au porteur de la cagnotte -- personne d'autre ne doit savoir
          si son compte est connecté ou non. */}
      {viewerIsPotOwner && <PotConnectionBanner connected={potOwnerStripeConnected} />}

      {/* Retour Thomas : "ça doit être en haut de la page d'accueil juste
          après la bannière de l'événement" -- avant même la carte "changer
          ma réponse" juste en dessous. */}
      <PollsQuotaWarningSection eventId={event.id} viewerRsvpId={viewerRsvpId} />

      {/* Retour Thomas : "si une personne coche je suis bien arrivé, il ne
          doit plus voir le cadre je viens, peut-être, je ne peux pas" --
          répondre à un événement où l'on est déjà arrivé (ou déjà rentré chez
          soi, ou que l'événement est Terminé) n'a plus de sens. */}
      {myRsvp &&
        !myRsvp.checkedInAt &&
        !myRsvp.arrivedHomeAt &&
        !isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at) && (
        <Card>
          <MyParticipationCard
            rsvpId={myRsvp.id}
            shortCode={event.short_code}
            currentAnswer={myRsvp.answer}
            // Retour Thomas : l'organisateur et le porteur d'une cagnotte
            // active ne peuvent jamais quitter (`leave_or_remove_participant`
            // le bloque déjà côté serveur) -- inutile de leur montrer un
            // bouton qui échouerait à chaque clic.
            showLeaveButton={!isHost && !viewerIsPotOwner}
            // Retour Thomas : "il faut dire qu'il reste dans l'événement car
            // il est responsable de la cagnotte ou organisateur" -- message
            // affiché dans la modale de confirmation "je ne peux pas".
            staysInEventReason={staysInEventReason}
            isEventOver={isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at)}
          />
        </Card>
      )}

      {/* Accompagnants modifiables après l'inscription (retour Thomas :
          "comment on pourrait faire pour remedier a ça" -- jusqu'ici
          verrouillés à l'inscription). `viewerRsvpId` existe pour tout le
          monde, y compris l'hôte -- voir son commentaire de type.
          `allow_companions` : l'hôte a peut-être désactivé les +1 pour cet
          événement. Retour Thomas : une fois "arrivé" ou "bien rentré",
          changer ses accompagnants n'a plus de sens -- même garde que la
          carte "changer ma réponse" juste au-dessus. */}
      {viewerRsvpId &&
        event.allow_companions &&
        !viewerAnsweredNoStillAdmin &&
        !myRsvp?.checkedInAt &&
        !myRsvp?.arrivedHomeAt &&
        !isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at) && (
        <Card>
          <CompanionsEditor
            rsvpId={viewerRsvpId}
            eventId={event.id}
            shortCode={event.short_code}
            initialCompanions={viewerCompanions}
            viewerClaims={viewerClaims}
            viewerVotes={viewerVotes}
          />
        </Card>
      )}

      {/* Retour Thomas : "julie - 39 ans, ça doit être mieux écrit... anniversaire
          de julie, elle fêtera ses 39 ans, adapter à chaque contexte" -- une
          vraie phrase par occasion plutôt qu'un "Nom - info" brut. "qui
          fêtera" (pas "il/elle fêtera") évite sciemment l'accord de genre :
          le prénom seul ne dit rien sur le genre de la personne. */}
      {(event.birthday_person || event.housewarming_hosts?.length || event.bachelor_person) && (
        <Card>
          {event.birthday_person && (
            <p className="font-display text-lg font-bold text-foreground">
              {event.show_age && event.birthday_age
                ? t("birthdaySentenceWithAge", { person: event.birthday_person, age: event.birthday_age })
                : t("birthdaySentence", { person: event.birthday_person })}
            </p>
          )}
          {!!event.housewarming_hosts?.length && (
            <p className="font-display text-lg font-bold text-foreground">
              {t("housewarmingSentence", { hosts: joinNames(event.housewarming_hosts) })}
            </p>
          )}
          {event.bachelor_person && (
            <p className="font-display text-lg font-bold text-foreground">
              {t("bachelorSentence", { person: event.bachelor_person })}
            </p>
          )}
        </Card>
      )}

      {/* Mode Jour J (brief 4.11) : bascule automatique de l'Accueil pendant
          le jour de l'événement (+ sa fin réelle pour un événement
          multi-jours, + 2 jours de grâce), ou clôturée plus tôt par un admin
          via le bouton "Terminer" (retour Thomas). Le bloc "Rentrer"/"bien
          rentré" (`GoHomeCard`, juste en dessous) reste affiché
          indépendamment de cet état -- "les gens qui rentrent chez eux" ne
          doivent jamais disparaître, même une fois l'événement "Terminé"
          (bug réel corrigé, voir DECISIONS.md). */}
      {isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at) ? (
        <EventFinishedCard eventId={event.id} shortCode={event.short_code} title={event.title} isAdmin={isAdmin} />
      ) : isJourJ(event.starts_at, event.date_mode, event.ends_at, event.ended_at) ? (
        <JourJCard
          eventId={event.id}
          shortCode={event.short_code}
          title={event.title}
          viewerRsvpId={viewerRsvpId}
          isAdmin={isAdmin}
          locationText={event.location_text}
          showWeather={shouldShowWeather(event.starts_at, event.date_mode, event.location_lat !== null && event.location_lng !== null)}
          lat={event.location_lat}
          lng={event.location_lng}
          dateISO={event.starts_at ? event.starts_at.slice(0, 10) : null}
        />
      ) : (
        // Retour Thomas : "il faudrait mettre la même chose [le gras] pour
        // les titres de toutes les cases de la page d'accueil" -- titre
        // font-display en gras ajouté à chaque carte qui n'en avait pas
        // encore, cohérent avec "Qui apporte quoi" (BringAccueilGauges).
        <Card className="flex flex-col gap-3">
          <p className="font-display text-lg font-bold text-foreground">{t("dateLocationHeading")}</p>
          {event.date_mode === "fixed" && event.starts_at ? (
            <p className="text-base font-semibold text-foreground">
              {formatDateTime(event.starts_at)}
              {event.ends_at ? ` · ${t("endsAtLabel", { time: formatTime(event.ends_at) })}` : ""}
            </p>
          ) : dateOptions.length > 0 ? (
            <DatePollVoting
              eventId={event.id}
              shortCode={event.short_code}
              isAdmin={isAdmin}
              options={dateOptions}
            />
          ) : (
            <p className="text-base font-semibold text-foreground">{t("dateTBD")}</p>
          )}

          {shouldShowWeather(event.starts_at, event.date_mode, event.location_lat !== null && event.location_lng !== null) && (
            <EventWeather
              lat={event.location_lat!}
              lng={event.location_lng!}
              dateISO={event.starts_at!.slice(0, 10)}
            />
          )}

          <ArrivalInfoBlock
            locationText={event.location_text}
            locationLat={event.location_lat}
            locationLng={event.location_lng}
            title={event.title}
          />
        </Card>
      )}

      {/* Indépendant de la carte ci-dessus (Jour J/Terminé/normale) --
          retour Thomas : "les gens qui rentrent chez eux" doivent toujours
          pouvoir cocher "bien rentré", même une fois l'événement "Terminé". */}
      {(isJourJ(event.starts_at, event.date_mode, event.ends_at, event.ended_at) ||
        isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at)) && (
        <GoHomeCard
          eventId={event.id}
          shortCode={event.short_code}
          title={event.title}
          viewerRsvpId={viewerRsvpId}
          locationText={event.location_text}
          locationLat={event.location_lat}
          locationLng={event.location_lng}
        />
      )}

      {event.description && (
        <Card className="flex flex-col gap-2">
          <p className="font-display text-lg font-bold text-foreground">{t("descriptionHeading")}</p>
          <p className="whitespace-pre-line text-base text-foreground">{event.description}</p>
        </Card>
      )}

      {(event.instructions ||
        event.dress_code ||
        event.bring_general ||
        event.rsvp_deadline ||
        event.kids_allowed ||
        event.pets_allowed) && (
        <Card className="flex flex-col gap-2">
          <p className="font-display text-lg font-bold text-foreground">{t("instructionsLabel")}</p>
          {event.instructions && (
            <p className="whitespace-pre-line text-base text-foreground">{event.instructions}</p>
          )}
          {event.dress_code && (
            <p className="text-sm text-foreground/80">
              {t("dressCodeLabel")} : {event.dress_code}
            </p>
          )}
          {event.bring_general && (
            <p className="text-sm text-foreground/80">
              {t("bringGeneralLabel")} : {event.bring_general}
            </p>
          )}
          {event.kids_allowed && (
            <p className="text-sm text-foreground/80">
              {t("kidsAllowedLabel")} : {t(event.kids_allowed)}
            </p>
          )}
          {event.pets_allowed && (
            <p className="text-sm text-foreground/80">
              {t("petsAllowedLabel")} : {t(event.pets_allowed)}
            </p>
          )}
          {event.rsvp_deadline && (
            <p className="text-sm text-foreground/80">
              {t("rsvpDeadlineLabel", { date: formatDate(event.rsvp_deadline) })}
            </p>
          )}
        </Card>
      )}

      {event.pot_enabled &&
        !(isBeneficiary && event.beneficiary_hidden_blocks.includes("pot")) &&
        (event.pot_closed_at ? (
          // Retour Thomas : "le gris il doit faire tout le cadre" -- pas le
          // composant `Card` partagé ici (son `bg-surface` par défaut
          // gagnerait sur le gris, même piège déjà rencontré avec
          // `PotConnectionBanner.tsx`), un vrai fond gris plein sur TOUT le
          // cadre. Titre "Cagnotte : ..." remis en gras/à gauche "comme
          // avant", seul le bloc confettis en dessous reste centré.
          <div className="flex flex-col gap-3 rounded-konfeti border border-border bg-canvas p-6 shadow-konfeti">
            <p className="font-display text-lg font-bold text-foreground">
              {t("potLabel", { label: event.pot_label || "" })}
            </p>
            <div className="flex flex-col items-center gap-2 text-center">
              <StickerConfetti className="h-12 w-12" />
              <p className="font-display text-2xl font-bold text-foreground">{t("potClosedTitle")}</p>
              <p className="text-lg font-semibold text-foreground/80">{(potCollectedCents / 100).toFixed(2)}€</p>
            </div>
            {!isBeneficiary && beneficiaryNames.length > 0 && (
              <p
                className={`text-xs font-semibold ${
                  event.beneficiary_hidden_blocks.includes("pot") ? "text-accent-coral" : "text-accent-mint"
                }`}
              >
                {t(event.beneficiary_hidden_blocks.includes("pot") ? "beneficiaryNoAccessNote" : "beneficiaryAccessNote", {
                  count: beneficiaryNames.length,
                  names: joinNames(beneficiaryNames),
                })}
              </p>
            )}
          </div>
        ) : (
          <Card>
            <p className="font-display text-lg font-bold text-foreground">
              {t("potLabel", { label: event.pot_label || "" })}
            </p>
            {/* Retour Thomas : plutôt que le total cumulé (pression sociale
                sur l'Accueil, "il n'y a que 20€"), juste le DERNIER paiement
                reçu -- crée un peu de dynamisme sans exposer le total ni qui
                a donné (jamais de nom ici, voir page.tsx). */}
            {lastContributionNetCents !== null && lastContributionAt && (
              <p className="text-sm font-semibold text-accent-mint">
                {t("lastContribution", {
                  amount: (lastContributionNetCents / 100).toFixed(2),
                  date: formatDate(lastContributionAt),
                })}
              </p>
            )}
            <p className="text-sm text-foreground/70">
              {event.pot_mode === "goal" && event.pot_goal_cents
                ? t("potGoal", { amount: (event.pot_goal_cents / 100).toFixed(0) })
                : t("potOpen")}
            </p>
            {/* Retour Thomas : "quand on choisit un objectif, il faut une
                barre verte comme qui apporte quoi" -- même style visuel que
                `BringGauge.tsx` (piste neutre, remplissage mint), jamais en
                mode "montant libre" (pas d'objectif = pas de barre
                possible). */}
            {event.pot_mode === "goal" && event.pot_goal_cents && (
              <div className="flex flex-col gap-1">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-canvas">
                  <div
                    className="h-full rounded-full bg-accent-mint transition-[width] duration-300"
                    style={{ width: `${Math.min(potCollectedCents / event.pot_goal_cents, 1) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-foreground/70">
                  {(potCollectedCents / 100).toFixed(2)}€ / {(event.pot_goal_cents / 100).toFixed(2)}€
                </span>
              </div>
            )}
            {/* Étape 5 du wizard (retour Thomas : "il faut le dire quand X a
                accès et aussi quand elle a pas accès" -- jamais silencieuse
                dans un sens comme dans l'autre). Jamais montrée au
                bénéficiaire lui-même à propos de lui-même (juste redondant,
                même logique que la bannière Coulisses) -- seuls les AUTRES
                la voient, qu'il ait accès ou non. */}
            {!isBeneficiary && beneficiaryNames.length > 0 && (
              <p
                className={`text-xs font-semibold ${
                  event.beneficiary_hidden_blocks.includes("pot") ? "text-accent-coral" : "text-accent-mint"
                }`}
              >
                {t(event.beneficiary_hidden_blocks.includes("pot") ? "beneficiaryNoAccessNote" : "beneficiaryAccessNote", {
                  count: beneficiaryNames.length,
                  names: joinNames(beneficiaryNames),
                })}
              </p>
            )}
          </Card>
        ))}

      {/* "Qui apporte quoi" (brief 4.4) : version compacte sur l'Accueil,
          retour Thomas ("dès que quelqu'un a rajouté un produit, on a un
          histogramme en barre à côté, la quantité reçue sur quantité
          demandée") -- même composant `BringGauge` que l'onglet Participer,
          BringAccueilGauges ne rend rien si aucun item n'existe. */}
      {!isBringListHidden && <BringAccueilGauges eventId={event.id} />}

      {/* Sondages : même principe compact sur l'Accueil (retour Thomas : "il
          ne faut pas mettre les sondages sur l'accueil ?"), lecture seule
          (vote uniquement depuis l'onglet Participer) -- ne rend rien si
          aucun sondage n'existe. */}
      {!isPollsListHidden && <PollsAccueilSummary eventId={event.id} />}

      {/* "Terminer" (brief 4.11, retour Thomas) : tout en bas de la page,
          uniquement pendant le Mode Jour J -- invisible avant que la fête ne
          commence, invisible aussi une fois déjà terminée (le bouton
          "Rouvrir" de la carte FINISH le remplace alors). */}
      {isAdmin && isJourJ(event.starts_at, event.date_mode, event.ends_at, event.ended_at) && (
        <EndEventButton eventId={event.id} shortCode={event.short_code} />
      )}
    </div>
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "long",
  });
}
