import { z } from "zod";

export const voteOptionSchema = z.object({
  optionId: z.string().uuid(),
  checked: z.boolean(),
});

export const pollIdSchema = z.object({
  pollId: z.string().uuid(),
});

// Proposition de sondage par un invité (retour Thomas : "les autres
// utilisateurs doivent pouvoir [proposer] un sondage... la même
// organisation que pour qui rapporte quoi"), modérée par l'admin -- même
// forme que la définition d'un sondage côté wizard.
export const proposePollSchema = z.object({
  question: z.string().trim().min(1).max(300),
  options: z.array(z.object({ label: z.string().trim().min(1).max(200) })).min(2).max(10),
});
