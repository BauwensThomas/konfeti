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
import { ShareEventButton } from "@/components/ShareEventButton";
import { Card } from "@/components/ui/Card";

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
    // Bouton Partager (brief 4.2) : visible de l'hôte, et de tout participant
    // approuvé si l'hôte a choisi "tous" (share_policy) plutôt que "admins
    // seulement". Personne d'autre que l'hôte n'est encore approuvé en
    // pratique (Phase 4, validation), mais le contrôle est déjà correct.
    const canShare = isHost || event.share_policy === "all";
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${event.short_code}`;

    return (
      <main className="flex flex-1 flex-col items-center gap-6 px-6 py-8 sm:py-12">
        {isHost && (
          <div className="flex w-full max-w-lg lg:max-w-2xl items-center justify-between gap-3">
            <Link href="/mes-evenements" className="text-sm font-semibold text-primary">
              {t("backToEvents")}
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href={`/e/${event.short_code}/modifier`}
                className="text-sm font-semibold text-primary"
              >
                {t("editEvent")}
              </Link>
              <CancelEventButton eventId={event.id} />
            </div>
          </div>
        )}
        {canShare && (
          <div className="flex w-full max-w-lg lg:max-w-2xl justify-center">
            <ShareEventButton title={event.title} url={shareUrl} />
          </div>
        )}
        <EventTabs
          accueil={
            <EventAccueil
              event={event}
              isHost={isHost}
              dateOptions={dateOptions}
              coverPhotoUrl={coverPhotoUrl}
            />
          }
        />
      </main>
    );
  }

  // Pas d'accès complet : on retombe sur l'aperçu public (titre + thème
  // seulement, brief 1.3), qui ne fuite jamais rien d'autre à un visiteur
  // non validé.
  const { data: preview } = await supabase
    .from("events_public_data")
    .select("id, short_code, title, theme, allow_companions")
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
        .select("status")
        .eq("event_id", preview.id)
        .eq("profile_id", user.id)
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
          className="w-24"
        />
        <h1 className="font-display text-2xl font-bold text-white">{preview.title}</h1>
      </div>
      <p className="max-w-sm lg:max-w-md text-sm text-foreground/70">{t("previewNotice")}</p>

      {myRsvp ? (
        <GuestPendingScreen />
      ) : (
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
};

async function EventAccueil({
  event,
  isHost,
  dateOptions,
  coverPhotoUrl,
}: {
  event: EventRow;
  isHost: boolean;
  dateOptions: {
    id: string;
    startsAt: string;
    label: string | null;
    voteCount: number;
    votedByMe: boolean;
  }[];
  coverPhotoUrl: string | null;
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

      {(event.birthday_person || event.housewarming_hosts?.length || event.bachelor_person) && (
        <Card>
          {event.birthday_person && (
            <p className="text-base text-foreground">
              {event.birthday_person}
              {event.show_age && event.birthday_age ? ` - ${event.birthday_age} ans` : ""}
            </p>
          )}
          {!!event.housewarming_hosts?.length && (
            <p className="text-base text-foreground">{event.housewarming_hosts.join(", ")}</p>
          )}
          {event.bachelor_person && (
            <p className="text-base text-foreground">{event.bachelor_person}</p>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        {event.date_mode === "fixed" && event.starts_at ? (
          <p className="text-base font-semibold text-foreground">
            {formatDateTime(event.starts_at)}
            {event.ends_at ? ` · ${t("endsAtLabel", { time: formatTime(event.ends_at) })}` : ""}
          </p>
        ) : dateOptions.length > 0 ? (
          <DatePollVoting
            eventId={event.id}
            shortCode={event.short_code}
            isAdmin={isHost}
            options={dateOptions}
          />
        ) : (
          <p className="text-base font-semibold text-foreground">{t("dateTBD")}</p>
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
        <Card>
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

      {event.pot_enabled && (
        <Card>
          <p className="text-base text-foreground">
            {t("potLabel", { label: event.pot_label || "" })}
          </p>
          <p className="text-sm text-foreground/70">
            {event.pot_mode === "goal" && event.pot_goal_cents
              ? t("potGoal", { amount: (event.pot_goal_cents / 100).toFixed(0) })
              : t("potOpen")}
          </p>
        </Card>
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
