import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export type PushCategory = "invitations" | "chat" | "organisation" | "jourj";

const CATEGORY_COLUMN: Record<PushCategory, string> = {
  invitations: "push_notif_invitations",
  chat: "push_notif_chat",
  organisation: "push_notif_organisation",
  jourj: "push_notif_jourj",
};

// Envoi best-effort, jamais bloquant pour l'appelant (même principe que
// `fetchPeriodForecasts` : une fonctionnalité bonus ne doit jamais faire
// planter l'action principale). `category: null` = toujours envoyé, ignore
// les préférences -- réservé à l'annulation d'événement (retour Thomas :
// "trop important pour être raté"). Client service_role créé à la volée,
// même pattern inline que `api/cron/event-reminders/route.ts` (pas de
// helper admin partagé dans ce projet).
export async function sendPush(
  userIds: string[],
  category: PushCategory | null,
  payload: { title: string; body: string; url: string; tag?: string },
): Promise<void> {
  if (userIds.length === 0) return;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let targetUserIds = userIds;
    if (category) {
      const column = CATEGORY_COLUMN[category];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .in("id", userIds)
        .eq(column, true);
      targetUserIds = (profiles ?? []).map((p) => p.id);
    }

    if (targetUserIds.length === 0) return;

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", targetUserIds);

    const body = JSON.stringify(payload);

    await Promise.all(
      (subscriptions ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        }
      }),
    );
  } catch {
    // Jamais d'exception qui remonte à l'appelant.
  }
}
