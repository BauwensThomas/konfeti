import { createClient } from "@/lib/supabase/server";
import { PollsQuotaWarning } from "@/components/polls/PollsQuotaWarning";

// Extrait de `PollsAccueilSummary.tsx` (retour Thomas : "ça doit être en
// haut de la page d'accueil juste après la bannière de l'événement" -- pas
// mélangé au récapitulatif compact des sondages, plus bas sur la page) :
// même calcul de quota (dépassement OU budget non réparti, voir
// `PollsListClient.tsx`/`CompanionsEditor.tsx` pour où ça se corrige), rendu
// séparément tout en haut de l'Accueil.
export async function PollsQuotaWarningSection({
  eventId,
  viewerRsvpId,
}: {
  eventId: string;
  viewerRsvpId: string | null;
}) {
  if (!viewerRsvpId) return null;
  const supabase = await createClient();

  const { data: pollRows } = await supabase
    .from("polls")
    .select("id, choice_mode")
    .eq("event_id", eventId)
    .eq("choice_mode", "single");
  const singlePolls = pollRows ?? [];
  if (singlePolls.length === 0) return null;
  const pollIds = singlePolls.map((p) => p.id);

  const { data: optionRows } = await supabase.from("poll_options").select("id, poll_id").in("poll_id", pollIds);
  const options = optionRows ?? [];
  const optionIds = options.map((o) => o.id);
  const optionPollById = new Map(options.map((o) => [o.id, o.poll_id]));

  const { data: voteRows } =
    optionIds.length > 0
      ? await supabase
          .from("poll_votes")
          .select("option_id, quantity")
          .eq("rsvp_id", viewerRsvpId)
          .in("option_id", optionIds)
      : { data: [] as { option_id: string; quantity: number }[] };

  const { count: companionsCount } = await supabase
    .from("companions")
    .select("id", { count: "exact", head: true })
    .eq("rsvp_id", viewerRsvpId);
  const budget = 1 + (companionsCount ?? 0);

  const allocatedByPoll = new Map<string, number>();
  for (const vote of voteRows ?? []) {
    const pollId = optionPollById.get(vote.option_id);
    if (!pollId) continue;
    allocatedByPoll.set(pollId, (allocatedByPoll.get(pollId) ?? 0) + vote.quantity);
  }

  let quotaWarning: "over" | "under" | null = null;
  let hasUnder = false;
  for (const pollId of pollIds) {
    const allocated = allocatedByPoll.get(pollId) ?? 0;
    if (allocated > budget) quotaWarning = "over";
    else if (allocated < budget) hasUnder = true;
  }
  if (!quotaWarning && hasUnder) quotaWarning = "under";

  if (!quotaWarning) return null;
  return <PollsQuotaWarning variant={quotaWarning} />;
}
