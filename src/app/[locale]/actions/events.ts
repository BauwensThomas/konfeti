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
    location_lat: data.locationLat,
    location_lng: data.locationLng,
    cover_photo_path: data.coverPhotoPath || null,
    occasion: data.occasion,
    // Bug réel signalé par Thomas : "j'ai modifié en nouvelle année, sur la
    // page d'accueil on voit toujours Julie 39 ans" -- le wizard ne vide
    // jamais les champs propres à une occasion quand on en choisit une
    // autre (les champs restent juste masqués côté UI, pas réinitialisés),
    // donc l'ancienne valeur repartait telle quelle vers la base. Corrigé
    // ICI (source unique de vérité, même pattern déjà en place pour
    // `pot_goal_cents` ci-dessous) plutôt que dans le wizard : protège aussi
    // contre tout futur bug d'état côté client, jamais contourné.
    birthday_person: data.occasion === "birthday" ? data.birthdayPerson || null : null,
    birthday_date: data.occasion === "birthday" ? data.birthdayDate || null : null,
    birthday_age: data.occasion === "birthday" ? (data.birthdayAge ?? null) : null,
    show_age: data.showAge,
    housewarming_hosts:
      data.occasion === "housewarming" && data.housewarmingHosts?.length ? data.housewarmingHosts : null,
    bachelor_person: data.occasion === "bachelor" ? data.bachelorPerson || null : null,
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
    beneficiary_hidden_blocks: data.beneficiaryHiddenBlocks,
  };
}

// "Qui apporte quoi" (brief 4.4) : synchronisé par DIFF plutôt qu'un
// delete+reinsert complet (comme `date_options` ci-dessous) -- un item déjà
// présent (identifié par son `id` réel) est mis à jour sur place, jamais
// recréé, pour ne JAMAIS faire tomber en cascade les `bring_claims` déjà
// engagées par les invités sur un item qui n'a pas changé. Réutilisée telle
// quelle par createEvent (aucun id existant, tout est un insert) et
// updateEvent (diff réel). Retourne `true` en cas de succès.
async function syncBringItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  items: CreateEventInput["bringItems"],
): Promise<boolean> {
  const { data: existing, error: fetchError } = await supabase
    .from("bring_items")
    .select("id")
    .eq("event_id", eventId);
  if (fetchError) return false;

  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  const submittedIds = new Set(items.filter((i) => i.id).map((i) => i.id!));

  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from("bring_items").delete().in("id", toDelete);
    if (error) return false;
  }

  const toInsert = items.filter((i) => !i.id);
  if (toInsert.length > 0) {
    const { error } = await supabase.from("bring_items").insert(
      toInsert.map((i) => ({
        event_id: eventId,
        label: i.label,
        unit: i.unit,
        quantity_needed: i.quantityNeeded,
      })),
    );
    if (error) return false;
  }

  for (const item of items.filter((i) => i.id)) {
    const { error } = await supabase
      .from("bring_items")
      .update({ label: item.label, unit: item.unit, quantity_needed: item.quantityNeeded })
      .eq("id", item.id!);
    if (error) return false;
  }

  return true;
}

// Sondages (brief : "Sondage(s) optionnel(s)") : même principe de diff que
// `syncBringItems`, mais à deux niveaux -- un sondage a ses propres options,
// qui doivent elles aussi être synchronisées par diff plutôt que
// recréées (un delete+reinsert d'une option ferait tomber ses `poll_votes`
// déjà pris en cascade, même raison que pour `bring_claims`).
async function syncPolls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  polls: CreateEventInput["polls"],
): Promise<boolean> {
  const { data: existing, error: fetchError } = await supabase.from("polls").select("id").eq("event_id", eventId);
  if (fetchError) return false;

  const existingIds = new Set((existing ?? []).map((r) => r.id as string));
  const submittedIds = new Set(polls.filter((p) => p.id).map((p) => p.id!));

  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase.from("polls").delete().in("id", toDelete);
    if (error) return false;
  }

  // Les sondages du wizard sont toujours `status = 'approved'` (comportement
  // historique), comme les items du wizard pour "qui apporte quoi" -- une
  // proposition d'invité (status 'pending') passe par `proposePoll`
  // (actions/polls.ts), jamais par ici.
  const toInsert = polls.filter((p) => !p.id);
  const insertedPolls: { id: string; question: string; options: CreateEventInput["polls"][number]["options"] }[] = [];
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("polls")
      .insert(toInsert.map((p) => ({ event_id: eventId, question: p.question, status: "approved" })))
      .select("id, question");
    if (error || !inserted) return false;
    // `insert().select()` renvoie les lignes dans l'ordre d'insertion (même
    // ordre que `toInsert`) : on peut donc réassocier chaque id généré à ses
    // options soumises par position.
    inserted.forEach((row, index) => {
      insertedPolls.push({ id: row.id as string, question: row.question as string, options: toInsert[index].options });
    });
  }

  const existingPolls = polls.filter((p) => p.id);
  for (const poll of existingPolls) {
    const { error } = await supabase.from("polls").update({ question: poll.question }).eq("id", poll.id!);
    if (error) return false;
  }

  // Diff des options, sondage par sondage (existants ET nouvellement créés).
  for (const poll of [...existingPolls.map((p) => ({ id: p.id!, options: p.options })), ...insertedPolls]) {
    const { data: existingOptions, error: fetchOptionsError } = await supabase
      .from("poll_options")
      .select("id")
      .eq("poll_id", poll.id);
    if (fetchOptionsError) return false;

    const existingOptionIds = new Set((existingOptions ?? []).map((r) => r.id as string));
    const submittedOptionIds = new Set(poll.options.filter((o) => o.id).map((o) => o.id!));

    const optionsToDelete = [...existingOptionIds].filter((id) => !submittedOptionIds.has(id));
    if (optionsToDelete.length > 0) {
      const { error } = await supabase.from("poll_options").delete().in("id", optionsToDelete);
      if (error) return false;
    }

    const optionsToInsert = poll.options.filter((o) => !o.id);
    if (optionsToInsert.length > 0) {
      const { error } = await supabase
        .from("poll_options")
        .insert(optionsToInsert.map((o) => ({ poll_id: poll.id, label: o.label })));
      if (error) return false;
    }

    for (const option of poll.options.filter((o) => o.id)) {
      const { error } = await supabase.from("poll_options").update({ label: option.label }).eq("id", option.id!);
      if (error) return false;
    }
  }

  return true;
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

  if (!(await syncBringItems(supabase, event.id, data.bringItems))) {
    return { ok: false, error: "unknown" };
  }

  if (!(await syncPolls(supabase, event.id, data.polls))) {
    return { ok: false, error: "unknown" };
  }

  redirect("/mes-evenements");
}

export async function updateEvent(
  eventId: string,
  shortCode: string,
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La contrainte "pas de date passée" ne saute que si l'événement est DÉJÀ
  // passé avant cette modification (corriger une coquille) — jamais pour
  // faire reculer un événement encore à venir (bug réel corrigé, voir
  // validation/event.ts). Lu avant la validation : il faut la date
  // ACTUELLEMENT enregistrée, pas celle du formulaire en cours de saisie.
  const { data: currentEvent } = await supabase
    .from("events")
    .select("date_mode, starts_at")
    .eq("id", eventId)
    .maybeSingle();
  const alreadyPast =
    currentEvent?.date_mode === "fixed" &&
    !!currentEvent.starts_at &&
    new Date(currentEvent.starts_at) < new Date();

  const parsed = updateEventSchema(alreadyPast).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }
  const data = parsed.data;

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

  if (!(await syncBringItems(supabase, eventId, data.bringItems))) {
    return { ok: false, error: "unknown" };
  }

  if (!(await syncPolls(supabase, eventId, data.polls))) {
    return { ok: false, error: "unknown" };
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
