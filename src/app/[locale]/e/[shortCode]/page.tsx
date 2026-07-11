import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EVENT_THEMES } from "@/lib/themes";
import { isEventFinished } from "@/lib/event-status";
import { EventTabs } from "@/components/EventTabs";
import { EventPhotoEditor } from "@/components/EventPhotoEditor";
import { CancelEventButton } from "@/components/CancelEventButton";
import { DatePollVoting } from "@/components/DatePollVoting";
import { GuestParticipation } from "@/components/GuestParticipation";
import { GuestPendingScreen } from "@/components/GuestPendingScreen";
import { GuestRestrictedScreen } from "@/components/GuestRestrictedScreen";
import { MyParticipationCard } from "@/components/MyParticipationCard";
import { EventPersonnes } from "@/components/EventPersonnes";
import { EventChat, getInitialUnreadCount } from "@/components/EventChat";
import { BringList } from "@/components/BringList";
import { PollsList } from "@/components/PollsList";
import { EventWeather } from "@/components/EventWeather";
import { shouldShowWeather } from "@/lib/weather";
import { BringAccueilGauges } from "@/components/bring/BringAccueilGauges";
import { PollsAccueilSummary } from "@/components/polls/PollsAccueilSummary";
import { ShareEventButton } from "@/components/ShareEventButton";
import { LinkAccountBanner } from "@/components/LinkAccountBanner";
import { Card } from "@/components/ui/Card";
import { buttonClassName } from "@/components/ui/Button";
import { joinNames } from "@/lib/joinNames";

// Open Graph dynamique (brief 5.7/Phase 3) : le titre/aperçu de partage
// reflète l'événement (titre réel), mais ne se base QUE sur `events_public_data`
// (titre + thème seulement), jamais sur la ligne `events` complète : un lien
// partagé peut être "unfurl" par un bot (WhatsApp, Messenger...) sans jamais
// passer par une session authentifiée, donc sans plus de droits qu'un
// visiteur anonyme (brief 1.3). `robots: noindex` : jamais indexé par un
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
          .select("id, role, answer")
          .eq("event_id", event.id)
          .eq("profile_id", user.id)
          .maybeSingle()
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

    // Canaux de chat réellement accessibles à CE viewer (retour Thomas :
    // pastille non-lus par canal, sans jamais notifier un bénéficiaire
    // bloqué d'une activité qu'il ne peut pas voir) -- même formule que
    // `EventChat.tsx` (isBeneficiary && le bloc concerné est masqué), utilisée
    // ici pour le compteur initial ET le filtre Realtime de `EventTabs`.
    const chatAllowedChannels: ("main" | "backstage")[] = [
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
            utilisateur connecté. Partager/Modifier/Supprimer regroupés dans
            une seule rangée de bulles, chacune dans une couleur distincte
            (Partager en jaune déjà via ShareEventButton, Modifier en violet,
            Supprimer en corail, icône seule). */}
        {(canShare || isAdmin) && (
          <div className="flex w-full max-w-lg lg:max-w-2xl flex-wrap items-center justify-center gap-3">
            {canShare && <ShareEventButton title={event.title} url={shareUrl} />}
            {isAdmin && (
              <>
                <Link
                  href={`/e/${event.short_code}/modifier`}
                  className={buttonClassName({ variant: "primary", size: "sm", className: "h-11" })}
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
              isAnonymous={!!user?.is_anonymous}
              dateOptions={dateOptions}
              coverPhotoUrl={coverPhotoUrl}
              beneficiaryNames={beneficiaryNames}
              isBringListHidden={isBringListHidden}
              isPollsListHidden={isPollsListHidden}
              myRsvp={
                !isHost && myRsvpRow
                  ? { id: myRsvpRow.id, answer: myRsvpRow.answer as "yes" | "maybe" | "no" }
                  : null
              }
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
              />
            )
          }
          pendingCount={pendingCount}
          pendingBringCount={pendingBringCount}
          pendingPollsCount={pendingPollsCount}
          chat={
            <EventChat
              eventId={event.id}
              viewerRsvpId={myRsvpRow?.id ?? null}
              isAdmin={isAdmin}
              isBeneficiary={isBeneficiary}
              isBackstageHidden={isBackstageHiddenForBeneficiaries}
              isChatHidden={isChatHiddenForBeneficiaries}
            />
          }
          participer={
            <div className="flex flex-col gap-4">
              {isPollsListHidden ? (
                <Card className="text-center text-sm text-foreground/60">{t("pollsListHidden")}</Card>
              ) : (
                <PollsList
                  eventId={event.id}
                  shortCode={event.short_code}
                  viewerRsvpId={myRsvpRow?.id ?? null}
                  isAdmin={isAdmin}
                />
              )}
              {isBringListHidden ? (
                <Card className="text-center text-sm text-foreground/60">{t("bringListHidden")}</Card>
              ) : (
                <BringList
                  eventId={event.id}
                  shortCode={event.short_code}
                  viewerRsvpId={myRsvpRow?.id ?? null}
                  isAdmin={isAdmin}
                />
              )}
            </div>
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
  const { data: potInfo } =
    myRsvp?.status === "restricted" && myRsvp.pot_access_granted
      ? await supabase
          .from("events_pot_data")
          .select("pot_enabled, pot_mode, pot_goal_cents, pot_label")
          .eq("id", preview.id)
          .maybeSingle()
      : { data: null };

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
          shortCode={preview.short_code}
          currentAnswer={myRsvp.answer as "yes" | "maybe" | "no"}
          potEnabled={preview.pot_enabled}
          wantsPotAccess={myRsvp.wants_pot_access}
          potAccessGranted={myRsvp.pot_access_granted}
          pot={potInfo}
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
  pot_enabled: boolean;
  pot_mode: "goal" | "open";
  pot_goal_cents: number | null;
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
  isAnonymous,
  dateOptions,
  coverPhotoUrl,
  beneficiaryNames,
  myRsvp,
  isBringListHidden,
  isPollsListHidden,
}: {
  event: EventRow;
  isHost: boolean;
  isAdmin: boolean;
  isBeneficiary: boolean;
  isAnonymous: boolean;
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
  myRsvp: { id: string; answer: "yes" | "maybe" | "no" } | null;
  // "Qui apporte quoi" (brief 4.4, retour Thomas : "dès que quelqu'un a
  // rajouté un produit, on a un histogramme en barre à côté... sur la page
  // d'accueil") -- même garde-fou de masquage que le reste (jamais montré au
  // bénéficiaire concerné).
  isBringListHidden: boolean;
  // Sondages (retour Thomas : "il ne faut pas mettre les sondages sur
  // l'accueil ?") -- même principe que `isBringListHidden` juste au-dessus.
  isPollsListHidden: boolean;
}) {
  const t = await getTranslations("EventPage");
  const tOccasions = await getTranslations("Occasions");
  const theme = EVENT_THEMES.find((th) => th.key === event.theme) ?? EVENT_THEMES[0];

  const mapsUrl = event.location_text
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location_text)}`
    : null;
  const wazeUrl = event.location_text
    ? `https://waze.com/ul?q=${encodeURIComponent(event.location_text)}&navigate=yes`
    : null;

  return (
    <div className="flex flex-col gap-4">
      {isAnonymous && <LinkAccountBanner />}
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
            {isEventFinished(event.starts_at, event.date_mode) && (
              <span className="w-fit rounded-full bg-accent-coral px-3 py-1 text-xs font-semibold text-white">
                {t("finishedBadge")}
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl font-bold">{event.title}</h1>
          {event.occasion && <p className="text-sm text-white/90">{tOccasions(event.occasion)}</p>}
        </div>

        <EventPhotoEditor eventId={event.id} isHost={isHost} initialPhotoUrl={coverPhotoUrl} />
      </div>

      {myRsvp && (
        <Card>
          <MyParticipationCard
            rsvpId={myRsvp.id}
            shortCode={event.short_code}
            currentAnswer={myRsvp.answer}
            showLeaveButton={true}
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

      {/* Retour Thomas : "il faudrait mettre la même chose [le gras] pour les
          titres de toutes les cases de la page d'accueil" -- titre
          font-display en gras ajouté à chaque carte qui n'en avait pas
          encore, cohérent avec "Qui apporte quoi" (BringAccueilGauges). */}
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

        {event.location_text && (
          <div className="flex flex-col gap-1">
            <p className="text-base text-foreground">{event.location_text}</p>
            <div className="flex gap-4 text-sm font-semibold text-primary">
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  {t("mapsLink")}
                </a>
              )}
              {wazeUrl && (
                <a href={wazeUrl} target="_blank" rel="noopener noreferrer">
                  {t("wazeLink")}
                </a>
              )}
            </div>
          </div>
        )}
      </Card>

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

      {event.pot_enabled && !(isBeneficiary && event.beneficiary_hidden_blocks.includes("pot")) && (
        <Card>
          <p className="font-display text-lg font-bold text-foreground">
            {t("potLabel", { label: event.pot_label || "" })}
          </p>
          <p className="text-sm text-foreground/70">
            {event.pot_mode === "goal" && event.pot_goal_cents
              ? t("potGoal", { amount: (event.pot_goal_cents / 100).toFixed(0) })
              : t("potOpen")}
          </p>
          {/* Étape 5 du wizard (retour Thomas : "il faut le dire quand X a
              accès et aussi quand elle a pas accès" -- jamais silencieuse
              dans un sens comme dans l'autre). Jamais montrée au
              bénéficiaire lui-même à propos de lui-même (juste redondant,
              même logique que la bannière Coulisses) -- seuls les AUTRES la
              voient, qu'il ait accès ou non. */}
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
      )}

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
