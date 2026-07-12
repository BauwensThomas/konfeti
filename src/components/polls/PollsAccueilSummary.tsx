import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";

type RawPollRow = {
  id: string;
  question: string;
};

type RawOptionRow = {
  id: string;
  poll_id: string;
  label: string;
};

// Version compacte des sondages sur l'Accueil (retour Thomas : "il ne faut
// pas mettre les sondages sur l'accueil ?"), même principe que
// `BringAccueilGauges.tsx` -- lecture seule (pas de vote possible ici),
// ne s'affiche pas du tout tant qu'aucun sondage n'existe. La RLS
// (`polls_select`) filtre déjà les sondages encore en attente pour un
// non-admin, comme pour la liste complète de l'onglet Participer.
// L'avertissement de quota (dépassement/budget non réparti) vit séparément,
// tout en haut de l'Accueil (retour Thomas) -- voir `PollsQuotaWarningSection`.
export async function PollsAccueilSummary({ eventId }: { eventId: string }) {
  const supabase = await createClient();
  const t = await getTranslations("Polls");

  const { data: pollRows } = await supabase
    .from("polls")
    .select("id, question")
    .eq("event_id", eventId)
    .order("question")
    .returns<RawPollRow[]>();

  const polls = pollRows ?? [];
  if (polls.length === 0) return null;

  const pollIds = polls.map((p) => p.id);
  const { data: optionRows } = await supabase
    .from("poll_options")
    .select("id, poll_id, label")
    .in("poll_id", pollIds)
    .order("label")
    .returns<RawOptionRow[]>();

  const options = optionRows ?? [];
  const optionIds = options.map((o) => o.id);
  const { data: voteRows } =
    optionIds.length > 0
      ? await supabase.from("poll_votes").select("option_id, quantity").in("option_id", optionIds)
      : { data: [] as { option_id: string; quantity: number }[] };

  const votes = voteRows ?? [];
  const voteCountByOption = new Map<string, number>();
  for (const vote of votes) {
    voteCountByOption.set(vote.option_id, (voteCountByOption.get(vote.option_id) ?? 0) + vote.quantity);
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="font-display text-lg font-bold text-foreground">{t("heading")}</p>
      {polls.map((poll) => (
        <div key={poll.id} className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">{poll.question}</p>
          <ul className="flex flex-col gap-0.5 text-xs text-foreground/70">
            {options
              .filter((option) => option.poll_id === poll.id)
              .map((option) => (
                <li key={option.id} className="flex items-center justify-between gap-2">
                  <span>{option.label}</span>
                  <span className="font-semibold text-primary">
                    {t("voteCount", { count: voteCountByOption.get(option.id) ?? 0 })}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
