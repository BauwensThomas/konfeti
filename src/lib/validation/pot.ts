import { z } from "zod";

// Montant NET minimum 1€ (en dessous, les frais fixes Stripe à eux seuls
// rendraient la contribution presque entièrement absorbée par les frais) et
// maximum 5000€ (garde-fou anti-abus, largement au-dessus de tout usage réel
// d'une cagnotte d'anniversaire).
export const createPotContributionSchema = z.object({
  eventId: z.string().uuid(),
  netCents: z.number().int().min(100).max(500000),
});

export const transferPotOwnershipSchema = z.object({
  eventId: z.string().uuid(),
  newOwnerProfileId: z.string().uuid(),
});
