"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  addBringItemSchema,
  approveBringItemSchema,
  claimBringItemSchema,
  itemIdSchema,
  mergeBringItemProposalSchema,
  proposeBringItemSchema,
  toggleBringBroughtSchema,
  updateBringItemQuantitySchema,
} from "@/lib/validation/bring";
import { isRateLimited } from "@/lib/rate-limit";

export type BringActionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_authenticated" | "rate_limited" | "unknown" };

// Bug réel trouvé en testant : un `.upsert()` direct sur la contrainte
// unique (item_id, rsvp_id) échouait avec "permission denied for table
// bring_claims" -- `bring_claims` n'accorde l'UPDATE que colonne par colonne
// (`quantity`/`brought`, jamais `item_id`/`rsvp_id`, volontairement, pour
// empêcher de réassigner une claim existante à un autre item/participant),
// mais `.upsert()` tente de réécrire TOUTES les colonnes du payload sur
// conflit, y compris `item_id`/`rsvp_id` jamais accordées en update. Corrigé
// par un check-puis-insert-ou-update explicite : un INSERT complet (une
// seule fois, toutes les colonnes accordées) puis un UPDATE restreint à
// `quantity` pour les fois suivantes. Factorisée : réutilisée par
// `claimBringItem` (un participant pour lui-même) ET `approveBringItem`/
// `mergeBringItemProposal` (un admin, pour le compte du proposant --
// nécessite la policy INSERT élargie côté admin, voir migration
// 20260710002500).
async function upsertBringClaim(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  rsvpId: string,
  quantity: number,
): Promise<{ error: boolean }> {
  const { data: existing } = await supabase
    .from("bring_claims")
    .select("id")
    .eq("item_id", itemId)
    .eq("rsvp_id", rsvpId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("bring_claims").update({ quantity }).eq("id", existing.id)
    : await supabase.from("bring_claims").insert({ item_id: itemId, rsvp_id: rsvpId, quantity });

  return { error: !!error };
}

// "Qui apporte quoi" (brief 4.4) : un participant réclame/ajuste SA PROPRE
// quantité sur un item -- `rsvpId` vient du client (comme `sendMessage`),
// la vraie frontière de sécurité est la policy RLS `bring_claims_write_own`/
// `bring_claims_update` (is_my_rsvp), pas ce contrôle applicatif.
export async function claimBringItem(
  eventId: string,
  shortCode: string,
  rsvpId: string,
  input: { itemId: string; quantity: number },
): Promise<BringActionResult> {
  const parsed = claimBringItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`claimBringItem:${user.id}`, 60, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await upsertBringClaim(supabase, parsed.data.itemId, rsvpId, parsed.data.quantity);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Proposition d'item par un invité (brief 4.4, retour Thomas : "tous les
// utilisateurs peuvent rajouter des produits qui ne sont pas dans la
// liste... avec une modération par les admins"). Toujours `status:
// 'pending'` -- jamais approuvé directement ici, la vraie frontière de
// sécurité est la policy RLS `bring_items_propose_own` (is_my_rsvp sur
// `proposed_by_rsvp_id`, statut forcé à 'pending').
export async function proposeBringItem(
  eventId: string,
  shortCode: string,
  rsvpId: string,
  input: { label: string; unit: string; quantityNeeded: number },
): Promise<BringActionResult> {
  const parsed = proposeBringItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`proposeBringItem:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await supabase.from("bring_items").insert({
    event_id: eventId,
    label: parsed.data.label,
    unit: parsed.data.unit,
    quantity_needed: parsed.data.quantityNeeded,
    status: "pending",
    proposed_by_rsvp_id: rsvpId,
  });

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Modération admin (brief 4.4). `bring_items_write_admin` (RLS, déjà en
// place, inchangée) autorise déjà l'admin à modifier/supprimer N'IMPORTE
// QUEL item de son événement, y compris 'pending' -- aucune nouvelle policy
// nécessaire pour l'UPDATE/DELETE de l'item lui-même.
//
// Retour Thomas : "quand quelqu'un demande pour rajouter un produit, c'est
// qu'il va ramener ça" -- approuver crée AUSSI une réclamation automatique
// pour le proposant, avec la quantité qu'il avait lui-même indiquée (pas
// juste rendre l'item visible en le laissant sans personne pour l'apporter).
//
// Retour Thomas, ajouté après coup : "l'admin quand il accepte, il doit dire
// combien de quantité il faudrait" -- l'admin peut donc ajuster la quantité
// NÉCESSAIRE au moment de l'approbation (ex. le proposant n'a demandé que
// 3L, mais l'admin sait qu'il en faut 10 au total pour tout le monde).
// `quantityNeeded` ici ne change QUE `bring_items.quantity_needed` -- la
// réclamation auto-créée pour le proposant reste sur SA quantité d'origine
// (jamais gonflée au nouveau total, il n'a jamais promis d'apporter plus).
export async function approveBringItem(
  shortCode: string,
  itemId: string,
  quantityNeeded?: number,
): Promise<BringActionResult> {
  const parsed = approveBringItemSchema.safeParse({ itemId, quantityNeeded });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { data: item } = await supabase
    .from("bring_items")
    .select("proposed_by_rsvp_id, quantity_needed")
    .eq("id", parsed.data.itemId)
    .maybeSingle();

  const { error } = await supabase
    .from("bring_items")
    .update({
      status: "approved",
      ...(parsed.data.quantityNeeded !== undefined ? { quantity_needed: parsed.data.quantityNeeded } : {}),
    })
    .eq("id", parsed.data.itemId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  if (item?.proposed_by_rsvp_id) {
    const { error: claimError } = await upsertBringClaim(
      supabase,
      parsed.data.itemId,
      item.proposed_by_rsvp_id,
      item.quantity_needed,
    );
    if (claimError) {
      return { ok: false, error: "unknown" };
    }
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Ajout direct d'un item par un admin depuis l'onglet Participer (retour
// Thomas : "pour les admin il faut juste un seul bouton, proposer/ajouter un
// item") -- toujours `status: 'approved'` d'emblée (comme un item défini au
// wizard), un SEUL formulaire pour l'admin (contrairement à la proposition
// d'un invité, jamais deux boutons distincts). `ownQuantity` optionnel :
// "s'il met pas de quantité à ce qu'il rapporte, ça créera l'item avec 0
// apporté pour le moment" -- une réclamation n'est créée pour l'admin QUE
// s'il a renseigné ce champ, jamais automatiquement à la quantité totale
// (contrairement à `approveBringItem`, où le proposant EST le seul
// destinataire prévu de la quantité demandée). `bring_items_write_admin`
// (RLS, déjà en place) est la vraie frontière de sécurité pour l'insertion
// de l'item -- `rsvpId` vient du client comme ailleurs, la frontière pour la
// réclamation reste `bring_claims_write_own` (élargie aux admins, migration
// 20260710002500).
export async function addBringItem(
  eventId: string,
  shortCode: string,
  rsvpId: string,
  input: { label: string; unit: string; quantityNeeded: number; ownQuantity?: number },
): Promise<BringActionResult> {
  const parsed = addBringItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`addBringItem:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const itemId = crypto.randomUUID();
  const { error } = await supabase.from("bring_items").insert({
    id: itemId,
    event_id: eventId,
    label: parsed.data.label,
    unit: parsed.data.unit,
    quantity_needed: parsed.data.quantityNeeded,
    status: "approved",
  });

  if (error) {
    return { ok: false, error: "unknown" };
  }

  if (parsed.data.ownQuantity && parsed.data.ownQuantity > 0) {
    const { error: claimError } = await upsertBringClaim(supabase, itemId, rsvpId, parsed.data.ownQuantity);
    if (claimError) {
      return { ok: false, error: "unknown" };
    }
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Refus (brief 4.4) : suppression définitive, pas de statut "refusé"
// conservé -- cohérent avec la simplicité déjà choisie pour ce chantier
// (voir aussi `deleteBringClaim`, même principe).
export async function rejectBringItem(shortCode: string, itemId: string): Promise<BringActionResult> {
  const parsed = itemIdSchema.safeParse({ itemId });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { error } = await supabase.from("bring_items").delete().eq("id", parsed.data.itemId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Edition admin de la quantité demandée d'un item déjà approuvé (retour
// Thomas : "les admins ou l'organisateur devrait pouvoir modifier la
// quantité"). `bring_items_write_admin` (RLS, déjà en place) couvre déjà
// cet UPDATE, aucune nouvelle policy nécessaire.
export async function updateBringItemQuantity(
  shortCode: string,
  input: { itemId: string; quantityNeeded: number },
): Promise<BringActionResult> {
  const parsed = updateBringItemQuantitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { error } = await supabase
    .from("bring_items")
    .update({ quantity_needed: parsed.data.quantityNeeded })
    .eq("id", parsed.data.itemId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Suppression admin d'un item déjà approuvé (retour Thomas : "...ou
// supprimer directement l'objet") -- supprime aussi les réclamations liées
// (cascade déjà en place sur `bring_claims.item_id`).
export async function deleteBringItem(shortCode: string, itemId: string): Promise<BringActionResult> {
  const parsed = itemIdSchema.safeParse({ itemId });
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { error } = await supabase.from("bring_items").delete().eq("id", parsed.data.itemId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Fusion d'une proposition en double dans un item déjà existant (retour
// Thomas : "l'admin doit pouvoir choisir la [l'item] si quelqu'un a déjà
// proposé ce produit") -- crée une réclamation sur l'item CIBLE pour le
// proposant d'origine (même quantité que sa proposition), puis supprime la
// proposition en double. Pas de nouvel item créé pour rien.
export async function mergeBringItemProposal(
  shortCode: string,
  input: { pendingItemId: string; targetItemId: string },
): Promise<BringActionResult> {
  const parsed = mergeBringItemProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { data: pendingItem } = await supabase
    .from("bring_items")
    .select("proposed_by_rsvp_id, quantity_needed")
    .eq("id", parsed.data.pendingItemId)
    .maybeSingle();

  if (pendingItem?.proposed_by_rsvp_id) {
    const { error: claimError } = await upsertBringClaim(
      supabase,
      parsed.data.targetItemId,
      pendingItem.proposed_by_rsvp_id,
      pendingItem.quantity_needed,
    );
    if (claimError) {
      return { ok: false, error: "unknown" };
    }
  }

  const { error } = await supabase.from("bring_items").delete().eq("id", parsed.data.pendingItemId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Retire sa propre réclamation (change d'avis, ne peut plus l'apporter).
export async function deleteBringClaim(
  shortCode: string,
  rsvpId: string,
  input: { itemId: string },
): Promise<BringActionResult> {
  const parsed = itemIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { error } = await supabase
    .from("bring_claims")
    .delete()
    .eq("item_id", parsed.data.itemId)
    .eq("rsvp_id", rsvpId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}

// Suivi jour J (brief 4.4 : "une case 'apporté' à cocher pendant la fête")
// -- réservé aux admins côté UI (le bouton n'est rendu que pour eux), même
// si la policy RLS fusionnée `bring_claims_update` autoriserait aussi le
// participant concerné à cocher sa propre ligne : pas une nouvelle
// restriction RLS à écrire, un simple choix d'affichage.
export async function toggleBringBrought(
  shortCode: string,
  input: { claimId: string; brought: boolean },
): Promise<BringActionResult> {
  const parsed = toggleBringBroughtSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { error } = await supabase
    .from("bring_claims")
    .update({ brought: parsed.data.brought })
    .eq("id", parsed.data.claimId);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  revalidatePath(`/e/${shortCode}`);
  return { ok: true };
}
