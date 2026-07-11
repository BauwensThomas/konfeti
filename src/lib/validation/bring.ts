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

// Approbation d'une proposition en attente (retour Thomas : "l'admin quand
// il accepte, il doit dire combien de quantité il faudrait") -- l'admin peut
// ajuster la quantité nécessaire au moment même de l'approbation, sans
// devoir repasser ensuite par l'édition normale d'un item déjà approuvé.
export const approveBringItemSchema = z.object({
  itemId: z.string().uuid(),
  quantityNeeded: z.coerce.number().positive().optional(),
});

// Ajout direct d'un item par un admin depuis l'onglet Participer (retour
// Thomas : "pour les admin il faut juste un seul bouton, proposer/ajouter un
// item") -- toujours `status: 'approved'` d'emblée. `ownQuantity` optionnel :
// "s'il met pas de quantité à ce qu'il rapporte, ça créera l'item avec 0
// apporté pour le moment" -- une réclamation n'est créée pour l'admin que
// s'il renseigne ce champ.
export const addBringItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  unit: z.enum(["piece", "liter", "gram", "kilogram"]),
  quantityNeeded: z.coerce.number().positive(),
  ownQuantity: z.coerce.number().positive().optional(),
});

// Fusion d'une proposition en double dans un item déjà existant (retour
// Thomas : "l'admin doit pouvoir choisir... si quelqu'un a déjà proposé ce
// produit").
export const mergeBringItemProposalSchema = z.object({
  pendingItemId: z.string().uuid(),
  targetItemId: z.string().uuid(),
});
