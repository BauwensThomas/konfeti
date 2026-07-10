import { z } from "zod";

export const claimBringItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
});

export const itemIdSchema = z.object({
  itemId: z.string().uuid(),
});

export const toggleBringBroughtSchema = z.object({
  claimId: z.string().uuid(),
  brought: z.boolean(),
});

// Proposition d'item par un invité (brief 4.4, retour Thomas), modérée par
// l'admin -- même forme que la définition d'un item côté wizard.
export const proposeBringItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  unit: z.enum(["piece", "liter", "gram", "kilogram"]),
  quantityNeeded: z.coerce.number().positive(),
});

// Edition admin de la quantité demandée d'un item déjà approuvé (retour
// Thomas : "les admins ou l'organisateur devrait pouvoir modifier la
// quantité ou supprimer directement l'objet").
export const updateBringItemQuantitySchema = z.object({
  itemId: z.string().uuid(),
  quantityNeeded: z.coerce.number().positive(),
});

// Fusion d'une proposition en double dans un item déjà existant (retour
// Thomas : "l'admin doit pouvoir choisir... si quelqu'un a déjà proposé ce
// produit").
export const mergeBringItemProposalSchema = z.object({
  pendingItemId: z.string().uuid(),
  targetItemId: z.string().uuid(),
});
