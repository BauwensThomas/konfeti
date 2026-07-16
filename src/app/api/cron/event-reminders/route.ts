import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "@/lib/email/brevo";
import { undecidedReminderEmail, tomorrowReminderEmail, postEventEmail } from "@/lib/email/templates";
import { sendPush } from "@/lib/push-send";
import { pushMessages } from "@/lib/push-messages";
import { logAdminEvent } from "@/lib/admin-log";

/**
 * Relances et rappels (brief 4.7) : "relances des indécis à J-7 et J-2,
 * rappel des 'oui' à J-1 avec adresse, message post-événement à J+1."
 * Appelé par Vercel Cron (voir `vercel.json`), protégé par CRON_SECRET --
 * même pattern que `/api/cron/purge-old-events`. Un passage par jour suffit
 * (comparaison de dates civiles, comme `isJourJ`/`isEventFinished`) ;
 * idempotent via les colonnes `reminder_*_sent_at` (`rsvps`), un participant
 * ne reçoit jamais deux fois le même rappel même si le cron tourne plusieurs
 * fois le même jour.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  // Échec fermé même si `CRON_SECRET` n'est pas configuré (audit sécurité) :
  // sans ce garde-fou explicite, une variable d'environnement oubliée sur
  // Vercel rend la comparaison vraie pour l'en-tête littéral "Bearer undefined".
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: events, error } = await supabase
    .from("events")
    .select("id, short_code, title, starts_at, location_text")
    .eq("status", "active")
    .eq("date_mode", "fixed")
    .not("starts_at", "is", null);

  if (error) {
    await logAdminEvent("cron:event-reminders", "error", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let sent = 0;

  for (const event of events ?? []) {
    const eventDay = new Date(event.starts_at!);
    eventDay.setHours(0, 0, 0, 0);
    const diffDays = Math.round((eventDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

    // Aucune des 5 fenêtres de rappel (0 = "C'est le Jour J", push
    // uniquement, pas d'email) : ne vaut pas la peine d'aller chercher les
    // destinataires pour cet événement.
    if (![7, 2, 1, 0, -1].includes(diffDays)) continue;

    const { data: recipients } = await supabase.rpc("get_reminder_recipients", { p_event_id: event.id });
    const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL}/e/${event.short_code}`;

    for (const recipient of recipients ?? []) {
      let template: { subject: string; html: string } | null = null;
      let column:
        | "reminder_j7_sent_at"
        | "reminder_j2_sent_at"
        | "reminder_j1_sent_at"
        | "reminder_jourj_sent_at"
        | "reminder_post_sent_at"
        | null = null;
      let pushPayload: { title: string; body: string; url: string } | null = null;

      if (diffDays === 7 && recipient.answer !== "yes" && !recipient.reminder_j7_sent_at) {
        template = undecidedReminderEmail({ firstName: recipient.first_name, eventTitle: event.title, eventUrl });
        column = "reminder_j7_sent_at";
        pushPayload = pushMessages.reminderUndecided(event.short_code, event.title);
      } else if (diffDays === 2 && recipient.answer !== "yes" && !recipient.reminder_j2_sent_at) {
        template = undecidedReminderEmail({ firstName: recipient.first_name, eventTitle: event.title, eventUrl });
        column = "reminder_j2_sent_at";
        pushPayload = pushMessages.reminderUndecided(event.short_code, event.title);
      } else if (diffDays === 1 && recipient.answer === "yes" && !recipient.reminder_j1_sent_at) {
        template = tomorrowReminderEmail({
          firstName: recipient.first_name,
          eventTitle: event.title,
          eventUrl,
          locationText: event.location_text,
        });
        column = "reminder_j1_sent_at";
        pushPayload = pushMessages.reminderTomorrow(event.short_code, event.title);
      } else if (diffDays === 0 && recipient.answer === "yes" && !recipient.reminder_jourj_sent_at) {
        // Pas d'email pour cette fenêtre (nouvelle, push uniquement).
        column = "reminder_jourj_sent_at";
        pushPayload = pushMessages.reminderJourJ(event.short_code, event.title);
      } else if (diffDays === -1 && recipient.answer === "yes" && !recipient.reminder_post_sent_at) {
        template = postEventEmail({ firstName: recipient.first_name, eventTitle: event.title, eventUrl });
        column = "reminder_post_sent_at";
        pushPayload = pushMessages.reminderPostEvent(event.short_code, event.title);
      }

      if (!column) continue;

      let attempted = false;

      if (template) {
        const ok = await sendTransactionalEmail({
          to: recipient.email,
          toName: recipient.first_name ?? undefined,
          subject: template.subject,
          html: template.html,
        });
        if (ok) attempted = true;
      }

      if (recipient.profile_id && pushPayload) {
        await sendPush([recipient.profile_id], "jourj", pushPayload);
        attempted = true;
      }

      if (attempted) {
        await supabase
          .from("rsvps")
          .update({ [column]: new Date().toISOString() })
          .eq("id", recipient.rsvp_id);
        sent++;
      }
    }
  }

  await logAdminEvent("cron:event-reminders", "info", `${sent} rappel(s) envoyé(s)`);
  return NextResponse.json({ sent });
}
