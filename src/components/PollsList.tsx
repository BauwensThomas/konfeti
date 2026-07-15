import { createClient } from "@/lib/supabase/server";
import { PollsListClient, type PollView } from "@/components/polls/PollsListClient";

type RawPollRow = {
  id: string;
  question: string;
  status: "pending" | "approved";
  proposed_by_rsvp_id: string | null;
  choice_mode: "single" | "multiple";
};

type RawOptionRow = {
  id: string;
  poll_id: string;
  label: string;
  external_url: string | null;
};

type RawVoteRow = {
  id: string;
  option_id: string;
  rsvp_id: string;
  quantity: number;
};

// Onglet Participer (brief : "Sondage(s) optionnel(s)") -- sondages définis
// par l'organisateur au wizard (voir CreateEventWizard.tsx/actions/events.ts)
// ou proposés par un invité et modérés par un admin, même organisation que
// "qui apporte quoi" (`BringList.tsx`). Comptage des votes agrégé ici (pas
// de nom de votant affiché, comme le sondage de date `DatePollVoting.tsx`
// -- une préférence de sondage reste plus discrète qu'un engagement "qui
// apporte quoi"), délègue l'affichage + les interactions + le temps réel à
// `PollsListClient`.
export async function PollsList({
  eventId,
  shortCode,
  viewerRsvpId,
  isAdmin,
  readOnly = false,
  hideApprovedList = false,
}: {
  eventId: string;
  shortCode: string;
  viewerRsvpId: string | null;
  isAdmin: boolean;
  // Événement terminé (brief 4.11, retour Thomas) : garde les résultats,
  // mais plus aucun vote/proposition possible.
  readOnly?: boolean;
  // Retour Thomas : organisateur/porteur de cagnotte ayant répondu "je ne
  // peux pas" -- ne voit plus que la modération, jamais la liste approuvée.
  hideApprovedList?: boolean;
}) {
  const supabase = await createClient();

  // RLS (`polls_select`) filtre déjà "approved uniquement" pour un
  // non-admin, "tout (y compris pending)" pour un admin -- une seule
  // requête suffit, pas besoin de distinguer ici.
  const { data: pollRows } = await supabase
    .from("polls")
    .select("id, question, status, proposed_by_rsvp_id, choice_mode")
    .eq("event_id", eventId)
    .order("question")
    .returns<RawPollRow[]>();

  const polls = pollRows ?? [];
  const pollIds = polls.map((p) => p.id);

  const { data: optionRows } =
    pollIds.length > 0
      ? await supabase
          .from("poll_options")
          .select("id, poll_id, label, external_url")
          .in("poll_id", pollIds)
          .order("label")
          .returns<RawOptionRow[]>()
      : { data: [] as RawOptionRow[] };

  const options = optionRows ?? [];
  const optionIds = options.map((o) => o.id);

  const { data: voteRows } =
    optionIds.length > 0
      ? await supabase
          .from("poll_votes")
          .select("id, option_id, rsvp_id, quantity")
          .in("option_id", optionIds)
          .returns<RawVoteRow[]>()
      : { data: [] as RawVoteRow[] };

  const votes = voteRows ?? [];

  // Quota "choix unique" (retour Thomas) : budget du viewer = lui-même + ses
  // accompagnants, à répartir entre les options d'un même sondage 'single'.
  // Retour Thomas : "j'ai dit que je ne venais pas... il me reste un vote à
  // répartir" -- budget à 0 pour qui ne vient pas (organisateur/porteur de
  // cagnotte répondant "non" tout en restant admin invisible), même bug que
  // `PollsQuotaWarningSection.tsx`.
  const { data: viewerRsvpRow } = viewerRsvpId
    ? await supabase.from("rsvps").select("answer").eq("id", viewerRsvpId).maybeSingle()
    : { data: null };
  const { count: viewerCompanionsCount } = viewerRsvpId
    ? await supabase.from("companions").select("id", { count: "exact", head: true }).eq("rsvp_id", viewerRsvpId)
    : { count: 0 };
  const viewerBudget = viewerRsvpRow?.answer === "no" ? 0 : 1 + (viewerCompanionsCount ?? 0);

  // Prénoms des proposants de sondages en attente uniquement (même pattern
  // que `BringList.tsx`).
  const proposerRsvpIds = [...new Set(polls.map((p) => p.proposed_by_rsvp_id).filter((id): id is string => !!id))];
  const nameByRsvpId = new Map<string, string>();

  if (proposerRsvpIds.length > 0) {
    if (isAdmin) {
      const { data } = await supabase.from("rsvps").select("id, first_name, last_name").in("id", proposerRsvpIds);
      for (const r of data ?? []) {
        nameByRsvpId.set(r.id, `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Anonyme");
      }
    } else {
      const { data } = await supabase
        .from("rsvps_public_data")
        .select("id, first_name, last_initial")
        .in("id", proposerRsvpIds);
      for (const r of data ?? []) {
        nameByRsvpId.set(r.id, `${r.first_name ?? ""} ${r.last_initial ?? ""}`.trim() || "Anonyme");
      }
    }
  }

  const pollViews: PollView[] = polls.map((poll) => ({
    id: poll.id,
    question: poll.question,
    status: poll.status,
    choiceMode: poll.choice_mode,
    proposedByName: poll.proposed_by_rsvp_id ? (nameByRsvpId.get(poll.proposed_by_rsvp_id) ?? "Anonyme") : null,
    options: options
      .filter((o) => o.poll_id === poll.id)
      .map((option) => {
        const optionVotes = votes.filter((v) => v.option_id === option.id);
        return {
          id: option.id,
          label: option.label,
          externalUrl: option.external_url,
          totalQuantity: optionVotes.reduce((sum, v) => sum + v.quantity, 0),
          myQuantity: optionVotes.find((v) => v.rsvp_id === viewerRsvpId)?.quantity ?? 0,
        };
      }),
  }));

  return (
    <PollsListClient
      eventId={eventId}
      shortCode={shortCode}
      viewerRsvpId={viewerRsvpId}
      viewerBudget={viewerBudget}
      isAdmin={isAdmin}
      initialPolls={pollViews}
      readOnly={readOnly}
      hideApprovedList={hideApprovedList}
    />
  );
}
