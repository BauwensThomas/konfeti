import { z } from "zod";

// Back-office /admin (Phase 9) : validation zod sur CHAQUE Server Action,
// avant tout appel Supabase -- même discipline que le reste du projet,
// aucune exception pour les actions admin (retour Thomas : prévenir toute
// injection via une entrée mal formée, même si le client `supabase-js`
// paramétrise déjà toutes les requêtes).
export const adminLoginSchema = z.object({
  password: z.string().min(1),
});

export const toggleFeatureFlagSchema = z.object({
  key: z.string().min(1).max(50),
  enabled: z.boolean(),
});

export const patchEventSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  startsAt: z.string().datetime().optional(),
  cancelled: z.boolean().optional(),
});

export const adminRsvpIdSchema = z.object({
  rsvpId: z.string().uuid(),
});

export const resendMagicLinkSchema = z.object({
  email: z.string().trim().email(),
});

export const adminSearchSchema = z.object({
  q: z.string().trim().min(1).max(200),
});
