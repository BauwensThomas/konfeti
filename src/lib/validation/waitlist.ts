import { z } from "zod";

export const waitlistSchema = z.object({
  // trim/toLowerCase d'abord (pipe), puis validation du format email sur la
  // valeur normalisée : z.email().trim() valide le format AVANT de nettoyer
  // les espaces, ce qui rejette à tort un email entouré d'espaces.
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
