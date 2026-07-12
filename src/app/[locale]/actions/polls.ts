"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pollIdSchema, proposePollSchema, setPollVoteSchema } from "@/lib/validation/polls";
import { isRateLimited } from "@/lib/rate-limit";
import { getEventAdminUserIds } from "@/lib/push-recipients";
import { sendPush } from "@/lib/push-send";
import { pushMessages } from "@/lib/push-messages";

export type PollActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_authenticated" | "rate_limited" | "quota_exceeded" | "unknown" };

// Vote sur une option de sondage (brief : "Sondage(s) optionnel(s)"), en
// quantité plutôt qu'une simple case à cocher (retour Thomas : sondage
// "choix unique" type menu resto -- "j'ai thomas +3... je sais pas avoir 4
// menus moules frites"). `quantity: 0` retire le vote. Toute la règle de
// quota ("choix unique" = 1 + accompagnants à répartir entre les options,
// "choix multiple" = quantité toujours 1) vit dans la fonction SQL
// `set_poll_vote` (security definer) -- jamais fait confiance au client,
// `rsvpId` n'est qu'un identifiant, la vraie frontière de sécurité est
// `is_my_rsvp` vérifié À L'INTÉRIEUR de la fonction.
export async function setPollVote(
  eventId: string,
  rsvpId: string,
  shortCode: string,
  input: { optionId: string; quantity: number },
): Promise<PollActionResult> {
  const parsed = setPollVoteSchema.safeParse(input);
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

  const { error } = await supabase.rpc("set_poll_vote", {
    p_rsvp_id: rsvpId,
    p_option_id: parsed.data.optionId,
    p_quantity: parsed.data.quantity,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message.includes("not authorized")
          ? "invalid"
          : error.message.includes("quota exceeded")
            ? "quota_exceeded"
            : "unknown",
    };
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
  input: { question: string; options: { label: string }[]; choiceMode?: "single" | "multiple" },
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
    choice_mode: parsed.data.choiceMode,
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

  if (!isAdmin) {
    try {
      const { data: eventTitleRow } = await supabase.from("events").select("title").eq("id", eventId).single();
      if (eventTitleRow) {
        const adminUserIds = await getEventAdminUserIds(supabase, eventId);
        void sendPush(adminUserIds, "organisation", pushMessages.newPollProposed(shortCode, eventTitleRow.title, parsed.data.question));
      }
    } catch {
      // Best-effort.
    }
  }

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
