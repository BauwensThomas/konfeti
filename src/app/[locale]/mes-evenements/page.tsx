import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isEventFinished, sortEventsByDate } from "@/lib/event-status";
import { computeUnreadCount } from "@/lib/chat/unread";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function MyEventsPage() {
  const t = await getTranslations("MyEvents");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Événements organisés par cet utilisateur. Les événements où il est seulement
  // invité viendront s'ajouter ici plus tard (Phase 4, gestion des rôles/statuts) :
  // tant qu'une invitation est "pending", RLS ne renvoie de toute façon que
  // l'aperçu titre+thème (brief 1.3), pas assez pour cette liste.
  const { data } = await supabase
    .from("events")
    .select("id, short_code, title, theme, starts_at, date_mode")
    .eq("host_id", user!.id)
    .neq("status", "cancelled");
  const events = sortEventsByDate(data ?? []);

  // Pastille non-lus (brief 4.3) : ne couvre que ces événements hébergés
  // (limite préexistante de cette page, pas propre au chat — voir
  // doc/TODO.md). 3 requêtes groupées plutôt qu'une boucle par événement.
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
        <ul className="flex w-full max-w-lg lg:max-w-2xl flex-col gap-4">
          {events.map((event) => {
            const finished = isEventFinished(event.starts_at, event.date_mode);
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
                      <p className="font-display text-lg text-foreground">
                        {event.title}
                      </p>
                      <p className="text-sm text-foreground/60">
                        {event.date_mode === "poll" || !event.starts_at
                          ? t("dateTBD")
                          : new Date(event.starts_at).toLocaleString("fr-BE", {
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
                    ) : (
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {t("hostBadge")}
                      </span>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
