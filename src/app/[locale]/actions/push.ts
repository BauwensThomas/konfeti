"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rate-limit";
import { pushSubscriptionSchema, pushCategorySchema, type PushSubscriptionInput, type PushCategoryInput } from "@/lib/validation/push";

export type PushActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "unknown" | "not_authenticated" | "rate_limited" };

// Un abonnement par appareil/navigateur (`endpoint` unique) -- `upsert` pour
// que réactiver les push sur un appareil déjà connu (permission retirée puis
// redonnée) ne crée pas de doublon, juste retrouve la même ligne.
export async function subscribeToPush(input: PushSubscriptionInput): Promise<PushActionResult> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`subscribeToPush:${user.id}`, 20, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}

export async function unsubscribeFromPush(endpoint: string): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}

const CATEGORY_COLUMN: Record<PushCategoryInput, "push_notif_invitations" | "push_notif_chat" | "push_notif_organisation" | "push_notif_jourj"> = {
  invitations: "push_notif_invitations",
  chat: "push_notif_chat",
  organisation: "push_notif_organisation",
  jourj: "push_notif_jourj",
};

// Mise à jour directe sur `profiles` (pas de RPC nécessaire, contrairement à
// `update_reminder_preference` : aucune cascade vers `rsvps` ici, ces 4
// colonnes ne sont lues qu'au moment de l'envoi, voir push-send.ts). Le
// grant column-level sur ces 4 colonnes précises est posé par la migration
// 20260713000400.
export async function updatePushCategoryPreference(
  category: PushCategoryInput,
  value: boolean,
): Promise<PushActionResult> {
  const parsedCategory = pushCategorySchema.safeParse(category);
  if (!parsedCategory.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`updatePushCategoryPreference:${user.id}`, 40, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const column = CATEGORY_COLUMN[parsedCategory.data];
  const { error } = await supabase.from("profiles").update({ [column]: value }).eq("id", user.id);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath("/profil");
  return { ok: true };
}
