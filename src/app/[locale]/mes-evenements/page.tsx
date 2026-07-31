import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { dateLocaleTag } from "@/lib/locale-date";
import { createClient } from "@/lib/supabase/server";
import { isEventOver, isJourJ, sortEventsByDate } from "@/lib/event-status";
import { computeUnreadCount } from "@/lib/chat/unread";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { InstallGuideLink } from "@/components/InstallGuideLink";
import { AdBanner } from "@/components/ads/AdBanner";

type EventRow = {
  id: string;
  short_code: string;
  title: string;
  theme: string;
  starts_at: string | null;
  date_mode: string;
  ends_at: string | null;
  ended_at: string | null;
};

export default async function MyEventsPage() {
  const t = await getTranslations("MyEvents");
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion?next=/mes-evenements");
  }

  // Retour Thomas : "j'aimerais rajouter des pub admob" -- même flag global
  // que "pot"/"chat_photos" (feature_flags), désactivé par défaut : le
  // composant AdBanner n'est même pas rendu tant que Thomas ne l'active pas
  // depuis /admin/flags.
  const { data: adsFlag } = await supabase.from("feature_flags").select("enabled").eq("key", "ads").maybeSingle();
  const adsEnabled = !!adsFlag?.enabled;

  const { data: hostedData } = await supabase
    .from("events")
    .select("id, short_code, title, theme, starts_at, date_mode, ends_at, ended_at")
    .eq("host_id", user!.id)
    .neq("status", "cancelled");
  const hostedEvents = sortEventsByDate(hostedData ?? []);
  const hostedIds = new Set(hostedEvents.map((e) => e.id));

  // Événements où l'on participe simplement (pas l'hôte) : retour Thomas —
  // "si un invité participe à plusieurs événements, il devrait pouvoir voir
  // la liste de ses événements", pas seulement ceux qu'il organise. `events`
  // (table brute) est déjà lisible par tout participant approuvé (policy
  // `events_select_full_for_participants`), pas besoin de `events_public_data`
  // ici. `host_id != user.id` exclu explicitement : l'hôte a lui aussi une
  // ligne `rsvps` `approved` pour son propre événement (`ensure_own_rsvp`),
  // qui apparaîtrait sinon en double dans les deux sections.
  const { data: attendingRsvps } = await supabase
    .from("rsvps")
    .select("event_id")
    .eq("profile_id", user!.id)
    .eq("status", "approved");
  const attendingEventIds = [...new Set((attendingRsvps ?? []).map((r) => r.event_id))].filter(
    (id) => !hostedIds.has(id),
  );
  const { data: attendingData } =
    attendingEventIds.length > 0
      ? await supabase
          .from("events")
          .select("id, short_code, title, theme, starts_at, date_mode, ends_at, ended_at")
          .in("id", attendingEventIds)
          .neq("status", "cancelled")
      : { data: [] as EventRow[] };
  const attendingEvents = sortEventsByDate(attendingData ?? []);

  // Événements où l'on a répondu mais où l'hôte n'a pas encore validé
  // (retour Thomas : "on a pas un truc evenement en attente ?") -- jusqu'ici
  // ces événements restaient invisibles depuis cette page (la seule trace
  // était `GuestPendingScreen` sur le lien direct de l'événement, aucune vue
  // d'ensemble si on attend une validation sur plusieurs événements à la fois).
  const { data: pendingRsvps } = await supabase
    .from("rsvps")
    .select("event_id")
    .eq("profile_id", user!.id)
    .eq("status", "pending");
  const pendingEventIds = [...new Set((pendingRsvps ?? []).map((r) => r.event_id))].filter(
    (id) => !hostedIds.has(id),
  );
  const { data: pendingData } =
    pendingEventIds.length > 0
      ? await supabase
          .from("events")
          .select("id, short_code, title, theme, starts_at, date_mode, ends_at, ended_at")
          .in("id", pendingEventIds)
          .neq("status", "cancelled")
      : { data: [] as EventRow[] };
  const pendingEvents = sortEventsByDate(pendingData ?? []);

  const events = [...hostedEvents, ...attendingEvents, ...pendingEvents];

  // Pastille non-lus (brief 4.3), désormais sur les deux sections (avant :
  // limité aux événements hébergés, voir doc/TODO.md — corrigé au passage
  // puisque cette page couvre maintenant aussi les événements où l'on
  // participe). 3 requêtes groupées plutôt qu'une boucle par événement.
  const eventIds = events.map((e) => e.id);
  const unreadCountByEvent = new Map<string, number>();
  if (eventIds.length > 0) {
    const [{ data: readRows }, { data: rsvpRows }, { data: messageRows }] = await Promise.all([
      supabase.from("chat_reads").select("event_id, last_read_at").in("event_id", eventIds).eq("channel", "main"),
      supabase.from("rsvps").select("id, event_id").in("event_id", eventIds).eq("profile_id", user!.id),
      supabase.from("messages").select("event_id, rsvp_id, created_at").in("event_id", eventIds).eq("channel", "main"),
    ]);

    const lastReadByEvent = new Map((readRows ?? []).map((r) => [r.event_id, r.last_read_at]));
    const myRsvpIdByEvent = new Map((rsvpRows ?? []).map((r) => [r.event_id, r.id]));

    for (const eventId of eventIds) {
      const threshold = lastReadByEvent.get(eventId);
      const relevant = (messageRows ?? []).filter(
        (m) => m.event_id === eventId && (!threshold || m.created_at > threshold),
      );
      unreadCountByEvent.set(
        eventId,
        computeUnreadCount(relevant.map((m) => ({ rsvpId: m.rsvp_id })), myRsvpIdByEvent.get(eventId) ?? null),
      );
    }
  }

  function EventCard({
    event,
    isHosted,
    isPending = false,
  }: {
    event: EventRow;
    isHosted: boolean;
    isPending?: boolean;
  }) {
    const finished = isEventOver(event.starts_at, event.date_mode, event.ends_at, event.ended_at);
    // Retour Thomas : "pourquoi je vois organisateur et pas en cours ?" --
    // pendant le Mode Jour J (jour de la fête + fin + jours de grâce), le
    // badge indique le statut temporel plutôt que le rôle, comme "Terminé"
    // le fait déjà.
    const ongoing = !finished && isJourJ(event.starts_at, event.date_mode, event.ends_at, event.ended_at);
    const unreadCount = unreadCountByEvent.get(event.id) ?? 0;
    return (
      <li key={event.id} className="relative">
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-coral px-1.5 text-xs font-bold text-white">
            {unreadCount}
          </span>
        )}
        <Link href={`/e/${event.short_code}`}>
          <Card className="flex items-center justify-between gap-4">
            <div className="text-left">
              <p className="font-display text-lg text-foreground">{event.title}</p>
              <p className="text-sm text-foreground/60">
                {event.date_mode === "poll" || !event.starts_at
                  ? t("dateTBD")
                  : new Date(event.starts_at).toLocaleString(dateLocaleTag(locale), {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </p>
            </div>
            {finished ? (
              <span className="rounded-full bg-accent-coral/10 px-3 py-1 text-xs font-semibold text-accent-coral">
                {t("finishedBadge")}
              </span>
            ) : ongoing ? (
              <span className="rounded-full bg-accent-mint/10 px-3 py-1 text-xs font-semibold text-accent-mint">
                {t("ongoingBadge")}
              </span>
            ) : isPending ? (
              <span className="rounded-full bg-accent-sky/10 px-3 py-1 text-xs font-semibold text-accent-sky">
                {t("pendingBadge")}
              </span>
            ) : (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {isHosted ? t("hostBadge") : t("attendingBadge")}
              </span>
            )}
          </Card>
        </Link>
      </li>
    );
  }

  // Retour Thomas : "la pub doit être tous les 3 événements, sinon quelqu'un
  // avec beaucoup d'événements ne la verra jamais" -- position calculée à
  // l'avance (pure, pas de mutation pendant le rendu) sur l'ordre combiné
  // hébergé/participe/en attente, pour qu'un pas de 3 s'applique à
  // l'ensemble réellement affiché peu importe comment la page est
  // découpée en sections.
  const adPositionByEventId = new Map(events.map((e, i) => [e.id, i]));
  function EventCardWithAd(props: { event: EventRow; isHosted: boolean; isPending?: boolean }) {
    const position = adPositionByEventId.get(props.event.id) ?? -1;
    // Retour Thomas : "il faut que la pub soit visible si moins de 3, ensuite
    // tous les 3 événements" -- avec moins de 3 événements au total, l'étape
    // "tous les 3" ne se déclencherait jamais : on affiche alors la pub
    // après le dernier événement de la liste.
    const isLastOfShortList = events.length < 3 && position === events.length - 1;
    const showAd = adsEnabled && position >= 0 && ((position + 1) % 3 === 0 || isLastOfShortList);
    return (
      <>
        <EventCard event={props.event} isHosted={props.isHosted} isPending={props.isPending} />
        {showAd && (
          <li className="list-none">
            <AdBanner />
          </li>
        )}
      </>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-12 sm:py-16">
      <div className="flex w-full max-w-lg lg:max-w-2xl items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-primary sm:text-3xl">
          {t("heading")}
        </h1>
        <Link href="/creer">
          <Button>{t("createButton")}</Button>
        </Link>
      </div>

      <InstallGuideLink />

      <PushNotificationPrompt />

      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <Image
            src="/mascot.webp"
            alt="La mascotte Konfeti"
            width={160}
            height={160}
            priority
            className="w-28"
          />
          <p className="font-display text-lg text-foreground">{t("emptyTitle")}</p>
          <p className="text-base text-foreground/70">{t("emptyText")}</p>
        </div>
      ) : (
        <div className="flex w-full max-w-lg lg:max-w-2xl flex-col gap-6">
          {/* Titres de section seulement si au moins deux catégories
              coexistent : pour le cas le plus courant (une seule catégorie
              non vide), une simple liste plate reste plus lisible qu'un
              unique titre de section. */}
          {[hostedEvents, attendingEvents, pendingEvents].filter((c) => c.length > 0).length > 1 ? (
            <>
              {hostedEvents.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="font-display text-lg font-bold text-foreground">
                    {t("organizingHeading")}
                  </h2>
                  <ul className="flex flex-col gap-4">
                    {hostedEvents.map((event) => (
                      <EventCardWithAd key={event.id} event={event} isHosted />
                    ))}
                  </ul>
                </div>
              )}
              {attendingEvents.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="font-display text-lg font-bold text-foreground">
                    {t("attendingHeading")}
                  </h2>
                  <ul className="flex flex-col gap-4">
                    {attendingEvents.map((event) => (
                      <EventCardWithAd key={event.id} event={event} isHosted={false} />
                    ))}
                  </ul>
                </div>
              )}
              {pendingEvents.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="font-display text-lg font-bold text-foreground">
                    {t("pendingHeading")}
                  </h2>
                  <ul className="flex flex-col gap-4">
                    {pendingEvents.map((event) => (
                      <EventCardWithAd key={event.id} event={event} isHosted={false} isPending />
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <ul className="flex flex-col gap-4">
              {hostedEvents.map((event) => (
                <EventCardWithAd key={event.id} event={event} isHosted />
              ))}
              {attendingEvents.map((event) => (
                <EventCardWithAd key={event.id} event={event} isHosted={false} />
              ))}
              {pendingEvents.map((event) => (
                <EventCardWithAd key={event.id} event={event} isHosted={false} isPending />
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}
