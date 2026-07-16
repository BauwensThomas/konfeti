import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logAdminEvent } from "@/lib/admin-log";

/**
 * Purge définitive (demande de Thomas, suppression "hybride") : un événement
 * annulé depuis plus de 90 jours, ou terminé depuis plus de 90 jours (jamais
 * annulé, juste passé), est supprimé pour de bon avec tout ce qui en dépend
 * (chat, rsvps, sondages, "qui apporte quoi", cagnotte...) via les `on delete
 * cascade` déjà en place sur `events.id`. La photo de couverture, elle,
 * n'est pas liée par une contrainte SQL : elle doit être retirée du Storage
 * explicitement avant de supprimer la ligne.
 *
 * Appelé par Vercel Cron (voir `vercel.json`), protégé par CRON_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: eventsToPurge, error: selectError } = await supabase
    .from("events")
    .select("id, cover_photo_path")
    .or(
      `and(status.eq.cancelled,cancelled_at.lt.${cutoff}),and(status.eq.active,date_mode.eq.fixed,starts_at.lt.${cutoff})`,
    );

  if (selectError) {
    await logAdminEvent("cron:purge-old-events", "error", selectError.message);
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }
  if (!eventsToPurge || eventsToPurge.length === 0) {
    await logAdminEvent("cron:purge-old-events", "info", "0 événement purgé");
    return NextResponse.json({ purged: 0 });
  }

  const photoPaths = eventsToPurge
    .map((event) => event.cover_photo_path)
    .filter((path): path is string => !!path);
  if (photoPaths.length > 0) {
    await supabase.storage.from("event-photos").remove(photoPaths);
  }

  const { error: deleteError } = await supabase
    .from("events")
    .delete()
    .in(
      "id",
      eventsToPurge.map((event) => event.id),
    );

  if (deleteError) {
    await logAdminEvent("cron:purge-old-events", "error", deleteError.message);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  await logAdminEvent("cron:purge-old-events", "info", `${eventsToPurge.length} événement(s) purgé(s)`);
  return NextResponse.json({ purged: eventsToPurge.length });
}
