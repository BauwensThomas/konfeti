"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DatePollResult = { ok: true } | { ok: false; error: "not_authenticated" | "unknown" };

export async function voteDateOption(
  eventId: string,
  optionId: string,
  checked: boolean,
  shortCode: string,
): Promise<DatePollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { data: rsvpId, error: rsvpError } = await supabase.rpc("ensure_own_rsvp", {
    p_event_id: eventId,
  });
  if (rsvpError || !rsvpId) {
    return { ok: false, error: "unknown" };
  }

  if (checked) {
    const { error } = await supabase
      .from("date_votes")
      .upsert({ option_id: optionId, rsvp_id: rsvpId }, { onConflict: "option_id,rsvp_id" });
    if (error) return { ok: false, error: "unknown" };
  } else {
    const { error } = await supabase
      .from("date_votes")
      .delete()
      .eq("option_id", optionId)
      .eq("rsvp_id", rsvpId);
    if (error) return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

export async function finalizeDatePoll(
  eventId: string,
  optionId: string,
  shortCode: string,
): Promise<DatePollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { data: option, error: optionError } = await supabase
    .from("date_options")
    .select("starts_at")
    .eq("id", optionId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (optionError || !option) {
    return { ok: false, error: "unknown" };
  }

  // RLS (events_update_by_admin) rejette silencieusement (0 ligne modifiée)
  // si l'appelant n'est pas admin : rien de plus à vérifier ici.
  const { error } = await supabase
    .from("events")
    .update({ date_mode: "fixed", starts_at: option.starts_at })
    .eq("id", eventId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}
