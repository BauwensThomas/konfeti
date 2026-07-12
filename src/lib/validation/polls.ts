import { z } from "zod";

// Vote par quantité (retour Thomas : sondage "choix unique" type menu resto,
// quota de "1 + accompagnants" à répartir entre les options -- `quantity: 0`
// retire le vote, symétrique de l'ancien `checked: false`). La vraie règle de
// quota est vérifiée en SQL (`set_poll_vote`, jamais fait confiance au
// client) ; ce schéma ne garde que les bornes de forme.
export const setPollVoteSchema = z.object({
  optionId: z.string().uuid(),
  quantity: z.number().int().min(0).max(50),
});

export const pollIdSchema = z.object({
  pollId: z.string().uuid(),
});

// Proposition de sondage par un invité (retour Thomas : "les autres
// utilisateurs doivent pouvoir [proposer] un sondage... la même
// organisation que pour qui rapporte quoi"), modérée par l'admin -- même
// forme que la définition d'un sondage côté wizard. `choiceMode` : "choix
// unique" (menu resto...) vs "choix multiple" (comportement historique,
// valeur par défaut), voir migration `polls_choice_mode_and_quantity`.
export const proposePollSchema = z.object({
  question: z.string().trim().min(1).max(300),
  options: z.array(z.object({ label: z.string().trim().min(1).max(200) })).min(2).max(10),
  choiceMode: z.enum(["single", "multiple"]).default("multiple"),
});
