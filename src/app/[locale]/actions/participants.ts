"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  rsvpIdSchema,
  approveRsvpSchema,
  setParticipantRoleSchema,
  updateMyAnswerSchema,
  transferEventHostSchema,
} from "@/lib/validation/participants";
import { isRateLimited } from "@/lib/rate-limit";

export type ParticipantActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "invalid"
        | "not_authenticated"
        | "rate_limited"
        | "unauthorized"
        | "last_admin"
        | "invalid_new_host"
        | "target_anonymous"
        | "unknown";
    };

// Un admin valide une demande en attente en lui attribuant un rôle (brief
// 1.3 étape 4). `admin_approve_rsvp` (security definer) vérifie elle-même
// les droits et le statut de départ ("pending" uniquement).
export async function approveRsvp(
  rsvpId: string,
  shortCode: string,
  role: "guest" | "beneficiary",
): Promise<ParticipantActionResult> {
  const parsed = approveRsvpSchema.safeParse({ rsvpId, role });
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

  if (isRateLimited(`approveRsvp:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("admin_approve_rsvp", {
    p_rsvp_id: parsed.data.rsvpId,
    p_role: parsed.data.role,
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Autorise explicitement un participant "restricted" ("je ne peux pas") à
// voir les infos de la cagnotte (durcissement décidé par Thomas : cet accès
// n'est plus instantané, voir page.tsx). `grant_pot_access` (SQL) vérifie
// elle-même les droits admin et que la ligne est toujours "restricted".
export async function grantPotAccess(
  rsvpId: string,
  shortCode: string,
): Promise<ParticipantActionResult> {
  const parsed = rsvpIdSchema.safeParse({ rsvpId });
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

  if (isRateLimited(`grantPotAccess:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("grant_pot_access", {
    p_rsvp_id: parsed.data.rsvpId,
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Refuse une demande d'accès cagnotte d'un participant restreint (symétrique
// de grantPotAccess) : remet simplement `wants_pot_access` à false, pas de
// retrait de l'événement (retour Thomas : quelqu'un qui ne participe pas à
// la cagnotte reste simplement dans "Ne peuvent pas venir", sans action
// admin requise). `deny_pot_access` (SQL) vérifie elle-même les droits admin.
export async function denyPotAccess(
  rsvpId: string,
  shortCode: string,
): Promise<ParticipantActionResult> {
  const parsed = rsvpIdSchema.safeParse({ rsvpId });
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

  if (isRateLimited(`denyPotAccess:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("deny_pot_access", {
    p_rsvp_id: parsed.data.rsvpId,
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Révoque un accès cagnotte déjà accordé (retour Thomas : "pouvoir mettre
// annulé aussi au cas où il change d'avis") — symétrique de grantPotAccess,
// sans contrainte sur le statut courant (purement défensif, voir la
// migration). `revoke_pot_access` (SQL) vérifie elle-même les droits admin.
export async function revokePotAccess(
  rsvpId: string,
  shortCode: string,
): Promise<ParticipantActionResult> {
  const parsed = rsvpIdSchema.safeParse({ rsvpId });
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

  if (isRateLimited(`revokePotAccess:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("revoke_pot_access", {
    p_rsvp_id: parsed.data.rsvpId,
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Refuser une demande "pending"/"restricted" ou retirer un participant
// "approved" : même fonction SQL, même bouton côté admin selon le contexte
// d'affichage (brief 1.3/1.5). `leave_or_remove_participant` anonymise la
// ligne et nettoie les engagements (sondages, companions...), sans jamais
// toucher à la cagnotte.
export async function removeParticipant(
  rsvpId: string,
  shortCode: string,
): Promise<ParticipantActionResult> {
  const parsed = rsvpIdSchema.safeParse({ rsvpId });
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

  if (isRateLimited(`removeParticipant:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("leave_or_remove_participant", {
    p_rsvp_id: parsed.data.rsvpId,
    p_new_status: "removed",
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Départ volontaire (brief 1.5) : même fonction que removeParticipant, mais
// avec le statut "left" — leave_or_remove_participant impose elle-même que
// seul le propriétaire de la ligne puisse choisir ce statut.
export async function leaveEvent(
  rsvpId: string,
  shortCode: string,
): Promise<ParticipantActionResult> {
  const parsed = rsvpIdSchema.safeParse({ rsvpId });
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

  if (isRateLimited(`leaveEvent:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("leave_or_remove_participant", {
    p_rsvp_id: parsed.data.rsvpId,
    p_new_status: "left",
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Change le rôle d'un participant déjà approuvé (invité <-> admin <->
// bénéficiaire). `set_participant_role` vérifie elle-même les droits et
// exige que la ligne ciblée soit déjà "approved".
export async function setParticipantRole(
  rsvpId: string,
  shortCode: string,
  role: "guest" | "admin" | "beneficiary",
): Promise<ParticipantActionResult> {
  const parsed = setParticipantRoleSchema.safeParse({ rsvpId, role });
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

  if (isRateLimited(`setParticipantRole:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("set_participant_role", {
    p_rsvp_id: parsed.data.rsvpId,
    p_role: parsed.data.role,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("not authorized")
        ? "unauthorized"
        : error.message.includes("last admin")
          ? "last_admin"
          : "unknown",
    };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Un participant change librement sa réponse à tout moment (décision
// produit, voir DECISIONS.md) : "je peux pas" bascule immédiatement en accès
// restreint, revenir sur "je viens"/"peut-être" depuis restricted renvoie
// dans le circuit normal de validation. `update_my_answer` gère la
// transition de statut elle-même.
export async function updateMyAnswer(
  rsvpId: string,
  shortCode: string,
  answer: "yes" | "maybe" | "no",
): Promise<ParticipantActionResult> {
  const parsed = updateMyAnswerSchema.safeParse({ rsvpId, answer });
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

  if (isRateLimited(`updateMyAnswer:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("update_my_answer", {
    p_rsvp_id: parsed.data.rsvpId,
    p_answer: parsed.data.answer,
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Transfert explicite de l'organisation vers un autre admin déjà approuvé
// (retour Thomas : impossible de quitter son propre événement en tant
// qu'hôte, `host_id` étant une colonne fixe jamais transférée jusqu'ici — un
// admin promu ne peut, lui, jamais faire ce transfert : `transfer_event_host`
// (SQL) vérifie elle-même que l'appelant est bien l'hôte ACTUEL). Une fois
// transféré, l'ancien hôte redevient un admin comme un autre et peut alors
// utiliser le circuit normal "Quitter l'événement" (`leaveEvent` ci-dessus).
export async function transferEventHost(
  eventId: string,
  newHostProfileId: string,
  shortCode: string,
): Promise<ParticipantActionResult> {
  const parsed = transferEventHostSchema.safeParse({ eventId, newHostProfileId });
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

  if (isRateLimited(`transferEventHost:${user.id}`, 20, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("transfer_event_host", {
    p_event_id: parsed.data.eventId,
    p_new_host_profile_id: parsed.data.newHostProfileId,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("not authorized")
        ? "unauthorized"
        : error.message.includes("real account")
          ? "target_anonymous"
          : error.message.includes("new host must be")
            ? "invalid_new_host"
            : "unknown",
    };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Le participant restreint ("je ne peux pas") demande lui-même à participer
// quand même à la cagnotte (affinage produit, retour Thomas : demander
// d'abord plutôt que de présenter une demande d'autorisation à l'admin pour
// tout le monde, la plupart ne se souciant pas de la cagnotte). Écriture
// directe sur sa propre ligne : `rsvps_update_own` (RLS) + le grant dédié sur
// cette seule colonne suffisent, pas besoin d'une fonction SQL.
export async function requestPotAccess(
  rsvpId: string,
  shortCode: string,
): Promise<ParticipantActionResult> {
  const parsed = rsvpIdSchema.safeParse({ rsvpId });
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

  if (isRateLimited(`requestPotAccess:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { data: updated, error } = await supabase
    .from("rsvps")
    .update({ wants_pot_access: true })
    .eq("id", parsed.data.rsvpId)
    .select("id");

  if (error) {
    return { ok: false, error: "unknown" };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "unauthorized" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}
