"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createEventSchema,
  updateEventSchema,
  type CreateEventInput,
} from "@/lib/validation/event";
import { generateShortCode } from "@/lib/short-code";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export type CreateEventResult =
  | { ok: true; shortCode: string }
  | { ok: false; error: "invalid" | "not_authenticated" | "rate_limited" | "unknown" };

function eventRowFromInput(data: CreateEventInput) {
  return {
    title: data.title,
    theme: data.theme,
    date_mode: data.dateMode,
    starts_at: data.dateMode === "fixed" ? data.startsAt : null,
    ends_at: data.endsAt || null,
    location_text: data.locationText,
    cover_photo_path: data.coverPhotoPath || null,
    occasion: data.occasion,
    birthday_person: data.birthdayPerson || null,
    birthday_date: data.birthdayDate || null,
    birthday_age: data.birthdayAge ?? null,
    show_age: data.showAge,
    housewarming_hosts: data.housewarmingHosts?.length ? data.housewarmingHosts : null,
    bachelor_person: data.bachelorPerson || null,
    description: data.description || null,
    instructions: data.instructions || null,
    dress_code: data.dressCode || null,
    bring_general: data.bringGeneral || null,
    rsvp_deadline: data.rsvpDeadline || null,
    kids_allowed: data.kidsAllowed || null,
    pets_allowed: data.petsAllowed || null,
    max_guests: data.maxGuests ?? null,
    allow_companions: data.allowCompanions,
    auto_approve: data.autoApprove,
    share_policy: data.sharePolicy,
    pot_enabled: data.potEnabled,
    pot_mode: data.potMode,
    pot_goal_cents: data.potEnabled && data.potMode === "goal" ? data.potGoalCents : null,
    pot_label: data.potLabel || null,
  };
}

export async function createEvent(
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return { ok: false, error: "not_authenticated" };
  }

  const ip = await getClientIp();
  if (isRateLimited(`createEvent:${user.id}`, 10, 60 * 60 * 1000) || isRateLimited(`createEvent:${ip}`, 20, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  let event: { id: string; short_code: string } | null = null;

  // Quelques essais en cas de collision sur short_code (quasi impossible,
  // ~8,8 × 10¹² combinaisons au total depuis l'augmentation d'entropie, voir
  // DECISIONS.md) mais la contrainte unique protège dans tous les cas. L'id
  // est généré
  // côté serveur (au lieu de laisser Postgres le faire) pour éviter un .select()
  // après l'insert : la ligne fraîchement créée ne passe pas encore la policy de
  // lecture (l'hôte n'a pas encore de ligne rsvp "admin"), donc un RETURNING
  // déclencherait une violation RLS même si l'insert lui-même est autorisé.
  for (let attempt = 0; attempt < 5 && !event; attempt++) {
    const shortCode = generateShortCode();
    const id = crypto.randomUUID();
    const { error } = await supabase
      .from("events")
      .insert({
        id,
        short_code: shortCode,
        host_id: user.id,
        ...eventRowFromInput(data),
      });

    if (!error) {
      event = { id, short_code: shortCode };
    } else if (error.code !== "23505") {
      return { ok: false, error: "unknown" };
    }
  }

  if (!event) {
    return { ok: false, error: "unknown" };
  }

  if (data.dateMode === "poll" && data.dateOptions) {
    const { error: dateOptionsError } = await supabase.from("date_options").insert(
      data.dateOptions.map((option) => ({
        event_id: event.id,
        starts_at: option.startsAt,
        label: option.label || null,
      })),
    );
    if (dateOptionsError) {
      return { ok: false, error: "unknown" };
    }
  }

  redirect("/mes-evenements");
}

export async function updateEvent(
  eventId: string,
  shortCode: string,
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const parsed = updateEventSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Contrairement à createEvent (qui exige un vrai compte, l'hôte doit être
  // identifiable durablement), modifier un événement est une action d'ADMIN
  // ordinaire : un invité "code d'accès" promu admin par l'hôte a les mêmes
  // droits que lui (retour Thomas : "il a les mêmes droits que celui qui a
  // créé l'événement... modifier les infos"), donc pas de blocage
  // `user.is_anonymous` ici — seule la policy RLS `events_update_by_admin`
  // (is_event_admin) doit trancher. Bug réel trouvé en creusant "Oups,
  // quelque chose s'est mal passé" pour un admin promu : ce blocage,
  // pertinent pour createEvent, avait été copié ici sans être reconsidéré.
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`updateEvent:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase
    .from("events")
    .update(eventRowFromInput(data))
    .eq("id", eventId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  // Les options de date sont entièrement remplacées plutôt que fusionnées :
  // plus simple et plus sûr qu'un diff ligne à ligne. `date_votes` existants
  // sont supprimés en cascade (`on delete cascade`), perte de vote assumée
  // sur un changement des options elles-mêmes.
  const { error: deleteOptionsError } = await supabase
    .from("date_options")
    .delete()
    .eq("event_id", eventId);
  if (deleteOptionsError) {
    return { ok: false, error: "unknown" };
  }

  if (data.dateMode === "poll" && data.dateOptions) {
    const { error: dateOptionsError } = await supabase.from("date_options").insert(
      data.dateOptions.map((option) => ({
        event_id: eventId,
        starts_at: option.startsAt,
        label: option.label || null,
      })),
    );
    if (dateOptionsError) {
      return { ok: false, error: "unknown" };
    }
  }

  redirect(`/e/${shortCode}`);
}

export async function cancelEvent(eventId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Même raison que updateEvent ci-dessus : un admin promu, même en session
  // anonyme, a les mêmes droits que l'hôte.
  if (!user) {
    return { ok: false };
  }

  const { error } = await supabase
    .from("events")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    return { ok: false };
  }

  redirect("/mes-evenements");
}

// Changer/supprimer la photo directement depuis la page événement (sans
// repasser par tout le wizard, demande de Thomas) : contrairement au wizard,
// ici le changement est persisté immédiatement, donc on peut nettoyer
// l'ancienne photo du Storage tout de suite (pas de risque de la supprimer
// "pour rien" si l'utilisateur abandonne un formulaire en cours).
export async function updateEventCoverPhoto(
  eventId: string,
  path: string | null,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Même raison que updateEvent ci-dessus : un admin promu, même en session
  // anonyme, a les mêmes droits que l'hôte.
  if (!user) {
    return { ok: false };
  }

  const { data: current } = await supabase
    .from("events")
    .select("cover_photo_path")
    .eq("id", eventId)
    .maybeSingle();

  const { error } = await supabase
    .from("events")
    .update({ cover_photo_path: path })
    .eq("id", eventId);

  if (error) {
    return { ok: false };
  }

  if (current?.cover_photo_path && current.cover_photo_path !== path) {
    await supabase.storage.from("event-photos").remove([current.cover_photo_path]);
  }

  return { ok: true };
}
