"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  rsvpIdSchema,
  approveRsvpSchema,
  setParticipantRoleSchema,
  updateMyAnswerSchema,
  transferEventHostSchema,
  addCompanionSchema,
  companionIdSchema,
} from "@/lib/validation/participants";
import { isRateLimited } from "@/lib/rate-limit";
import { getEventAdminUserIds } from "@/lib/push-recipients";
import { sendPush } from "@/lib/push-send";
import { pushMessages } from "@/lib/push-messages";

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
        | "organizer_protected"
        | "still_owns_pot"
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

  try {
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("profile_id, events(title)")
      .eq("id", parsed.data.rsvpId)
      .single();
    const eventTitle = (rsvp?.events as unknown as { title: string } | null)?.title;
    if (rsvp?.profile_id && eventTitle) {
      void sendPush([rsvp.profile_id], "invitations", pushMessages.rsvpApproved(shortCode, eventTitle));
    }
  } catch {
    // Best-effort.
  }

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
    return {
      ok: false,
      error: error.message.includes("not authorized")
        ? "unauthorized"
        : error.message.includes("organizer cannot")
          ? "organizer_protected"
          : error.message.includes("still owns an active pot")
            ? "still_owns_pot"
            : "unknown",
    };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Bloque définitivement un participant sur CET événement (retour Thomas,
// Phase 9 : retirer quelqu'un d'un événement "ouvert" ne l'empêche pas de
// revenir, `create_own_rsvp` réactivant automatiquement l'ancienne ligne).
// `admin_block_participant` (SQL) fait le même travail que
// `leave_or_remove_participant(..., 'removed')` en plus de poser
// `blocked = true`, et vérifie elle-même les droits admin.
export async function blockParticipant(rsvpId: string, shortCode: string): Promise<ParticipantActionResult> {
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

  if (isRateLimited(`blockParticipant:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("admin_block_participant", { p_rsvp_id: parsed.data.rsvpId });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Débloque un participant précédemment bloqué (symétrique) : la ligne reste
// "removed" (pas de réintégration automatique), elle pourra simplement
// resoumettre son identité normalement si elle revient. `admin_unblock_participant`
// (SQL) vérifie elle-même les droits admin.
export async function unblockParticipant(rsvpId: string, shortCode: string): Promise<ParticipantActionResult> {
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

  if (isRateLimited(`unblockParticipant:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.rpc("admin_unblock_participant", { p_rsvp_id: parsed.data.rsvpId });

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

  // Capturé AVANT l'appel RPC : le départ anonymise la ligne (prénom
  // effacé), il faut le vrai nom pour la notif à l'hôte.
  const { data: rsvpBefore } = await supabase
    .from("rsvps")
    .select("event_id, first_name, events(title)")
    .eq("id", parsed.data.rsvpId)
    .maybeSingle();

  const { error } = await supabase.rpc("leave_or_remove_participant", {
    p_rsvp_id: parsed.data.rsvpId,
    p_new_status: "left",
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes("not authorized")
        ? "unauthorized"
        : error.message.includes("organizer cannot")
          ? "organizer_protected"
          : error.message.includes("still owns an active pot")
            ? "still_owns_pot"
            : "unknown",
    };
  }

  revalidatePath(`/e/${shortCode}`);

  if (rsvpBefore?.event_id) {
    try {
      const eventTitle = (rsvpBefore.events as unknown as { title: string } | null)?.title;
      if (eventTitle) {
        const adminUserIds = await getEventAdminUserIds(supabase, rsvpBefore.event_id);
        void sendPush(
          adminUserIds,
          "invitations",
          pushMessages.guestLeft(shortCode, eventTitle, rsvpBefore.first_name ?? "Un invité"),
        );
      }
    } catch {
      // Best-effort.
    }
  }

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
          : error.message.includes("cannot change the organizer role")
            ? "organizer_protected"
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

  // Capturé AVANT l'appel RPC : "non" anonymise la ligne (prénom effacé),
  // il faut le vrai nom pour la notif à l'hôte.
  const { data: rsvpBefore } =
    parsed.data.answer === "no"
      ? await supabase
          .from("rsvps")
          .select("event_id, first_name, events(title)")
          .eq("id", parsed.data.rsvpId)
          .maybeSingle()
      : { data: null };

  const { error } = await supabase.rpc("update_my_answer", {
    p_rsvp_id: parsed.data.rsvpId,
    p_answer: parsed.data.answer,
  });

  if (error) {
    return { ok: false, error: error.message.includes("not authorized") ? "unauthorized" : "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);

  if (parsed.data.answer === "no" && rsvpBefore?.event_id) {
    try {
      const eventTitle = (rsvpBefore.events as unknown as { title: string } | null)?.title;
      if (eventTitle) {
        const adminUserIds = await getEventAdminUserIds(supabase, rsvpBefore.event_id);
        void sendPush(
          adminUserIds,
          "invitations",
          pushMessages.guestCantCome(shortCode, eventTitle, rsvpBefore.first_name ?? "Un invité"),
        );
      }
    } catch {
      // Best-effort.
    }
  }

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
        : error.message.includes("new host must be")
          ? "invalid_new_host"
          : "unknown",
    };
  }

  revalidatePath(`/e/${shortCode}`);

  try {
    const { data: event } = await supabase.from("events").select("title").eq("id", parsed.data.eventId).single();
    if (event) {
      void sendPush([parsed.data.newHostProfileId], "invitations", pushMessages.hostTransferred(shortCode, event.title));
    }
  } catch {
    // Best-effort.
  }

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

// Ajout d'un accompagnant après l'inscription (retour Thomas : jusqu'ici les
// accompagnants n'étaient saisissables qu'à l'inscription elle-même, sans
// moyen d'en rajouter ou d'en retirer par la suite). Écriture directe,
// RLS `companions_write_own` (is_my_rsvp) fait déjà toute la vérification de
// propriété -- `rsvpId` vient du client comme partout ailleurs dans ce fichier.
export async function addCompanion(
  rsvpId: string,
  shortCode: string,
  input: { kind: "partner" | "child" | "friend" | "family"; firstName?: string },
): Promise<ParticipantActionResult> {
  const parsed = addCompanionSchema.safeParse({ rsvpId, ...input });
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

  if (isRateLimited(`addCompanion:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { data: inserted, error } = await supabase
    .from("companions")
    .insert({ rsvp_id: parsed.data.rsvpId, kind: parsed.data.kind, first_name: parsed.data.firstName || null })
    .select("id");

  if (error) {
    return { ok: false, error: "unknown" };
  }
  if (!inserted || inserted.length === 0) {
    return { ok: false, error: "unauthorized" };
  }

  revalidatePath(`/e/${shortCode}`);

  try {
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("event_id, first_name, events(title)")
      .eq("id", parsed.data.rsvpId)
      .single();
    const eventTitle = (rsvp?.events as unknown as { title: string } | null)?.title;
    if (rsvp?.event_id && eventTitle) {
      const adminUserIds = await getEventAdminUserIds(supabase, rsvp.event_id);
      void sendPush(
        adminUserIds,
        "organisation",
        pushMessages.companionAdded(shortCode, eventTitle, rsvp.first_name ?? "Un invité"),
      );
    }
  } catch {
    // Best-effort.
  }

  return { ok: true };
}

// Retrait d'un accompagnant, symétrique de `addCompanion` -- même RLS
// (`companions_write_own`), pas besoin de `rsvpId` : la policy DELETE se
// vérifie déjà sur `rsvp_id` de la ligne visée elle-même.
export async function removeCompanion(companionId: string, shortCode: string): Promise<ParticipantActionResult> {
  const parsed = companionIdSchema.safeParse({ companionId });
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

  if (isRateLimited(`removeCompanion:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { data: deleted, error } = await supabase
    .from("companions")
    .delete()
    .eq("id", parsed.data.companionId)
    .select("id, rsvp_id");

  if (error) {
    return { ok: false, error: "unknown" };
  }
  if (!deleted || deleted.length === 0) {
    return { ok: false, error: "unauthorized" };
  }

  revalidatePath(`/e/${shortCode}`);

  // Retrait d'un accompagnant = budget qui baisse (1 + accompagnants
  // restants) : un sondage à choix unique déjà réparti peut désormais
  // dépasser le nouveau quota (même calcul que PollsQuotaWarningSection.tsx,
  // reproduit ici côté serveur pour notifier l'invité concerné lui-même).
  try {
    const rsvpId = deleted[0]!.rsvp_id;
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("event_id, profile_id, events(title)")
      .eq("id", rsvpId)
      .single();
    const eventTitle = (rsvp?.events as unknown as { title: string } | null)?.title;

    if (rsvp?.event_id && rsvp.profile_id && eventTitle) {
      const { data: pollRows } = await supabase
        .from("polls")
        .select("id")
        .eq("event_id", rsvp.event_id)
        .eq("choice_mode", "single");
      const pollIds = (pollRows ?? []).map((p) => p.id);

      if (pollIds.length > 0) {
        const { data: optionRows } = await supabase.from("poll_options").select("id, poll_id").in("poll_id", pollIds);
        const options = optionRows ?? [];
        const optionIds = options.map((o) => o.id);
        const optionPollById = new Map(options.map((o) => [o.id, o.poll_id]));

        const { data: voteRows } =
          optionIds.length > 0
            ? await supabase.from("poll_votes").select("option_id, quantity").eq("rsvp_id", rsvpId).in("option_id", optionIds)
            : { data: [] as { option_id: string; quantity: number }[] };

        const { count: companionsCount } = await supabase
          .from("companions")
          .select("id", { count: "exact", head: true })
          .eq("rsvp_id", rsvpId);
        const budget = 1 + (companionsCount ?? 0);

        const allocatedByPoll = new Map<string, number>();
        for (const vote of voteRows ?? []) {
          const pollId = optionPollById.get(vote.option_id);
          if (!pollId) continue;
          allocatedByPoll.set(pollId, (allocatedByPoll.get(pollId) ?? 0) + vote.quantity);
        }

        const isOverQuota = [...allocatedByPoll.values()].some((allocated) => allocated > budget);
        if (isOverQuota) {
          void sendPush([rsvp.profile_id], "organisation", pushMessages.pollQuotaExceeded(shortCode, eventTitle));
        }
      }
    }
  } catch {
    // Best-effort.
  }

  return { ok: true };
}

// Mode Jour J (brief 4.11) : bouton "Je suis arrivé", tapé par l'invité en
// arrivant. Écriture directe sur sa propre ligne, même principe que
// `requestPotAccess` juste au-dessus (`rsvps_update_own` + grant dédié sur
// cette colonne suffisent, pas besoin d'une fonction SQL). Re-cliquable dans
// les deux sens (retour Thomas : "on doit pouvoir cliquer dessus et recliquer
// si on a fait une erreur") -- `arrived` vient du client, qui pilote son
// propre état optimiste, `null` efface simplement la coche.
//
// Retour Thomas : "il doit passer de peut-être (s'il est sur peut-être) à je
// viens... s'il reclique sur arrivé il reprend son ancien statut" -- arriver
// implique forcément "je viens", donc une réponse 'maybe' bascule sur 'yes'
// au check-in ; annuler le check-in restaure la réponse d'origine plutôt que
// de la laisser sur 'yes' (voir migration `answer_before_checkin`).
export async function checkIn(rsvpId: string, shortCode: string, arrived: boolean): Promise<ParticipantActionResult> {
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

  const { data: current } = await supabase
    .from("rsvps")
    .select("answer, answer_before_checkin")
    .eq("id", parsed.data.rsvpId)
    .maybeSingle();

  const updates: {
    checked_in_at: string | null;
    answer?: "yes" | "maybe" | "no";
    answer_before_checkin?: string | null;
  } = { checked_in_at: arrived ? new Date().toISOString() : null };

  if (arrived && current?.answer === "maybe") {
    updates.answer = "yes";
    updates.answer_before_checkin = "maybe";
  } else if (!arrived && current?.answer_before_checkin) {
    updates.answer = current.answer_before_checkin as "yes" | "maybe" | "no";
    updates.answer_before_checkin = null;
  }

  const { data: updated, error } = await supabase
    .from("rsvps")
    .update(updates)
    .eq("id", parsed.data.rsvpId)
    .select("id");

  if (error) {
    return { ok: false, error: "unknown" };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "unauthorized" };
  }

  revalidatePath(`/e/${shortCode}`);

  if (arrived) {
    try {
      const { data: rsvp } = await supabase
        .from("rsvps")
        .select("event_id, first_name, events(title)")
        .eq("id", parsed.data.rsvpId)
        .single();
      const eventTitle = (rsvp?.events as unknown as { title: string } | null)?.title;
      if (rsvp?.event_id && eventTitle) {
        const adminUserIds = await getEventAdminUserIds(supabase, rsvp.event_id);
        void sendPush(
          adminUserIds,
          "jourj",
          pushMessages.guestCheckedIn(shortCode, eventTitle, rsvp.first_name ?? "Un invité"),
        );
      }
    } catch {
      // Best-effort.
    }
  }

  return { ok: true };
}

// Mode Jour J, symétrique de `checkIn` pour la fin de soirée (retour Thomas,
// proposé en cours de plan : "je suis bien rentré... ça évite d'attendre un
// sms"). Visible de TOUT LE MONDE (pas seulement les admins, contrairement
// au compteur d'arrivées) via `rsvps_public_data` -- voir migration
// `20260711000300_jour_j_arrived_home.sql`. Re-cliquable, même raison que
// `checkIn` ci-dessus.
export async function markArrivedHome(
  rsvpId: string,
  shortCode: string,
  arrived: boolean,
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

  const { data: updated, error } = await supabase
    .from("rsvps")
    .update({ arrived_home_at: arrived ? new Date().toISOString() : null })
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
