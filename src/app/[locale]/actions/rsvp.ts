"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ensureGuestSession } from "@/lib/supabase/guest-session";
import { rsvpIdentitySchema, guestCodeSchema, type RsvpIdentityInput } from "@/lib/validation/rsvp";

export type SubmitRsvpResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "already_rsvped" | "unknown" };

// Crée la participation de l'appelant (statut "pending", brief 1.3 étape 3),
// pour les deux portes (compte réel ou session anonyme créée à la volée).
// `create_own_rsvp` (security definer) gère le statut/rôle/guest_code,
// colonnes hors de portée du client (voir la migration dédiée) ; les
// accompagnants restent un insert direct, autorisé par `companions_write_own`.
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

  const supabase = await createClient();
  const user = await ensureGuestSession(supabase);
  if (!user) {
    return { ok: false, error: "unknown" };
  }

  // Se souvenir de l'identité sur cet appareil/ce compte pour la prochaine
  // fois (brief 1.2 : "on ne redemande jamais deux fois").
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

  const { data: rsvpResult, error: rpcError } = (await supabase
    .rpc("create_own_rsvp", {
      p_event_id: eventId,
      p_first_name: data.firstName,
      p_last_name: data.lastName,
      p_phone: data.phone,
      p_gender: data.gender,
      p_avatar_kind: data.avatarKind,
      p_avatar_value: data.avatarValue ?? null,
      p_answer: data.answer,
    })
    .single()) as { data: { rsvp_id: string; guest_code: string } | null; error: { message: string } | null };

  if (rpcError || !rsvpResult) {
    return { ok: false, error: "already_rsvped" };
  }

  if (data.companions.length > 0) {
    await supabase.from("companions").insert(
      data.companions.map((companion) => ({
        rsvp_id: rsvpResult.rsvp_id,
        kind: companion.kind,
        first_name: companion.firstName || null,
      })),
    );
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

export type RedeemGuestCodeResult =
  | { ok: true; shortCode: string }
  | { ok: false; error: "invalid" | "conflict" | "unknown" };

// Récupération cross-device (brief 1.2) : rattache la participation
// existante à la session courante (réelle ou anonyme créée à la volée).
export async function redeemGuestCode(code: string): Promise<RedeemGuestCodeResult> {
  const parsed = guestCodeSchema.safeParse({ code });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const user = await ensureGuestSession(supabase);
  if (!user) {
    return { ok: false, error: "unknown" };
  }

  const { data, error } = await supabase.rpc("redeem_guest_code", {
    p_code: parsed.data.code,
  });

  if (error || !data) {
    return { ok: false, error: error?.message.includes("deja") ? "conflict" : "invalid" };
  }

  return { ok: true, shortCode: data };
}
