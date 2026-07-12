"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/guest-session";
import { rsvpIdentitySchema, type RsvpIdentityInput } from "@/lib/validation/rsvp";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { getEventAdminUserIds } from "@/lib/push-recipients";
import { sendPush } from "@/lib/push-send";
import { pushMessages } from "@/lib/push-messages";

export type SubmitRsvpResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "already_rsvped" | "rate_limited" | "unknown" };

// Crée la participation de l'appelant (statut "pending", brief 1.3 étape 3),
// une fois connecté (retour Thomas : porte unique de connexion, plus de
// session créée à la volée). `create_own_rsvp` (security definer) gère le
// statut/rôle, colonnes hors de portée du client (voir la migration dédiée) ;
// les accompagnants restent un insert direct, autorisé par
// `companions_write_own`.
export async function submitRsvp(
  eventId: string,
  shortCode: string,
  input: RsvpIdentityInput,
): Promise<SubmitRsvpResult> {
  const parsed = rsvpIdentitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }
  const data = parsed.data;

  const ip = await getClientIp();
  if (isRateLimited(`submitRsvp:${ip}`, 10, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user) {
    return { ok: false, error: "unknown" };
  }

  // Se souvenir de l'identité sur ce compte pour la prochaine fois (brief
  // 1.2 : "on ne redemande jamais deux fois").
  await supabase
    .from("profiles")
    .update({
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone,
      gender: data.gender,
      avatar_kind: data.avatarKind,
      avatar_value: data.avatarValue ?? null,
    })
    .eq("id", user.id);

  const { data: rsvpId, error: rpcError } = await supabase.rpc("create_own_rsvp", {
    p_event_id: eventId,
    p_first_name: data.firstName,
    p_last_name: data.lastName,
    p_phone: data.phone,
    p_gender: data.gender,
    p_avatar_kind: data.avatarKind,
    p_avatar_value: data.avatarValue ?? null,
    p_answer: data.answer,
  });

  if (rpcError || !rsvpId) {
    return { ok: false, error: "already_rsvped" };
  }

  if (data.companions.length > 0) {
    await supabase.from("companions").insert(
      data.companions.map((companion) => ({
        rsvp_id: rsvpId,
        kind: companion.kind,
        first_name: companion.firstName || null,
      })),
    );
  }

  // Consentement rappels (brief 4.7) : `create_own_rsvp` ne connaît pas cette
  // colonne (jamais touchée à la création dans la fonction SQL) -- mise à
  // jour séparée, auto-service comme `wants_pot_access`/`checked_in_at`
  // (`rsvps_update_own` + grant dédié suffisent).
  if (data.wantsReminders) {
    await supabase.from("rsvps").update({ wants_reminders: true }).eq("id", rsvpId);
  }

  revalidatePath(`/e/${shortCode}`);

  try {
    const { data: event } = await supabase.from("events").select("title").eq("id", eventId).single();
    if (event) {
      const adminUserIds = await getEventAdminUserIds(supabase, eventId);
      void sendPush(adminUserIds, "invitations", pushMessages.newRsvpRequest(shortCode, event.title, data.firstName));
    }
  } catch {
    // Best-effort, ne doit jamais faire échouer l'inscription elle-même.
  }

  return { ok: true };
}
