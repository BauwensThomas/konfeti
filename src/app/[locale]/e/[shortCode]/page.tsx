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
import { Card } from "@/components/ui/Card";

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
    .select("short_code, title, theme")
    .eq("short_code", shortCode)
    .maybeSingle();

  if (!preview) notFound();

  const t = await getTranslations("EventPage");
  const theme = EVENT_THEMES.find((th) => th.key === preview.theme) ?? EVENT_THEMES[0];

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
