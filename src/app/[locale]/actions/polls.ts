"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pollIdSchema, proposePollSchema, voteOptionSchema } from "@/lib/validation/polls";
import { isRateLimited } from "@/lib/rate-limit";

export type PollActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_authenticated" | "rate_limited" | "unknown" };

// Vote sur une option de sondage (brief : "Sondage(s) optionnel(s)") --
// quasi copie de `voteDateOption` (`date-poll.ts`) : plusieurs options
// votables à la fois par sondage (contrainte unique en base sur
// `(option_id, rsvp_id)`, pas `(poll_id, rsvp_id)`, confirmé avec Thomas).
// `rsvpId` vient du client, la vraie frontière de sécurité reste la policy
// RLS `poll_votes_write_own` (is_my_rsvp).
export async function votePollOption(
  eventId: string,
  rsvpId: string,
  shortCode: string,
  input: { optionId: string; checked: boolean },
): Promise<PollActionResult> {
  const parsed = voteOptionSchema.safeParse(input);
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

  if (parsed.data.checked) {
    const { error } = await supabase
      .from("poll_votes")
      .upsert({ option_id: parsed.data.optionId, rsvp_id: rsvpId }, { onConflict: "option_id,rsvp_id" });
    if (error) return { ok: false, error: "unknown" };
  } else {
    const { error } = await supabase
      .from("poll_votes")
      .delete()
      .eq("option_id", parsed.data.optionId)
      .eq("rsvp_id", rsvpId);
    if (error) return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Proposition de sondage par un invité (retour Thomas : "les autres
// utilisateurs doivent pouvoir [proposer] un sondage... la même
// organisation que pour qui rapporte quoi"). Toujours `status: 'pending'`,
// jamais approuvé directement ici -- la vraie frontière de sécurité est la
// policy RLS `polls_propose_own`/`poll_options_propose_own`. Insertion en
// deux temps (le sondage, puis ses options, qui ont besoin du `poll_id`).
export async function proposePoll(
  eventId: string,
  shortCode: string,
  rsvpId: string,
  input: { question: string; options: { label: string }[] },
): Promise<PollActionResult> {
  const parsed = proposePollSchema.safeParse(input);
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

  if (isRateLimited(`proposePoll:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  // Retour Thomas : "il ne faut jamais redemander une confirmation
  // approuver ou refuser quand un admin ou un organisateur propose une
  // nouvelle demande" -- un admin qui propose un sondage n'a pas besoin de
  // sa propre validation, contrairement à un simple invité. Vérifié
  // SERVEUR (jamais un flag envoyé par le client) : un client malveillant
  // qui mentirait ici se ferait de toute façon rejeter par la RLS
  // (`polls_propose_own` exige `status = 'pending'`, `polls_write_admin`
  // exige un VRAI `is_event_admin`) -- cette vérification n'est qu'une
  // décision d'affichage, jamais la frontière de sécurité elle-même.
  const { data: event } = await supabase.from("events").select("host_id").eq("id", eventId).maybeSingle();
  const { data: myRsvp } = await supabase.from("rsvps").select("role").eq("id", rsvpId).maybeSingle();
  const isAdmin = event?.host_id === user.id || myRsvp?.role === "admin";

  // `id` généré ICI plutôt que par le `default gen_random_uuid()` de la
  // colonne, pour ne JAMAIS avoir besoin d'un `.select()` après l'insert.
  // Piège Postgres réel rencontré en le testant avec Thomas : `INSERT ...
  // RETURNING` exige aussi que la policy SELECT (`polls_select`) autorise la
  // ligne insérée -- or un sondage `pending` n'est visible que d'un admin,
  // jamais du proposant lui-même (comportement voulu). Sans RETURNING,
  // Postgres n'évalue plus que la policy INSERT (`polls_propose_own`, qui
  // elle autorise bien cette ligne) : plus d'erreur RLS fantôme sur une
  // proposition pourtant parfaitement valide.
  const pollId = crypto.randomUUID();
  const { error: pollError } = await supabase.from("polls").insert({
    id: pollId,
    event_id: eventId,
    question: parsed.data.question,
    status: isAdmin ? "approved" : "pending",
    proposed_by_rsvp_id: rsvpId,
  });

  if (pollError) {
    return { ok: false, error: "unknown" };
  }

  const { error: optionsError } = await supabase
    .from("poll_options")
    .insert(parsed.data.options.map((option) => ({ poll_id: pollId, label: option.label })));

  // Nettoyage best-effort si les options échouent : un proposant (non-admin)
  // n'a normalement pas le droit de supprimer un sondage (`polls_delete_admin`
  // réservée aux admins) -- ce sondage orphelin sans options resterait donc
  // visible en modération jusqu'à ce qu'un admin le traite. Cas résiduel rare
  // (les options sont déjà validées par `proposePollSchema` en amont),
  // assumé plutôt que de complexifier avec une fonction `security definer`.
  if (optionsError) {
    await supabase.from("polls").delete().eq("id", pollId);
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Modération admin. `polls_write_admin`/`update_admin`/`delete_admin` (RLS,
// déjà en place) autorisent déjà l'admin à modifier/supprimer n'importe quel
// sondage de son événement, y compris 'pending' -- aucune nouvelle policy
// nécessaire pour l'UPDATE/DELETE du sondage lui-même.
export async function approvePoll(shortCode: string, pollId: string): Promise<PollActionResult> {
  const parsed = pollIdSchema.safeParse({ pollId });
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

  const { error } = await supabase.from("polls").update({ status: "approved" }).eq("id", parsed.data.pollId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Refus : suppression définitive (cascade sur poll_options/poll_votes), pas
// de statut "refusé" conservé -- même principe que `rejectBringItem`.
export async function rejectPoll(shortCode: string, pollId: string): Promise<PollActionResult> {
  const parsed = pollIdSchema.safeParse({ pollId });
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

  const { error } = await supabase.from("polls").delete().eq("id", parsed.data.pollId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}
