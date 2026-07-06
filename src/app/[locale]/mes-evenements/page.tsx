import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isEventFinished, sortEventsByDate } from "@/lib/event-status";
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
            return (
              <li key={event.id}>
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
