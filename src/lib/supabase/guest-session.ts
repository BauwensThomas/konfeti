import { createClient } from "@/lib/supabase/server";

/**
 * Exige une vraie session pour l'appelant (retour Thomas : "que les gens se
 * connectent à leur compte directement" -- plus de création de session à la
 * volée, contrairement à l'ancien comportement de cette fonction). `null` si
 * personne n'est connecté : simple filet de sécurité côté serveur, puisque
 * l'UI ne devrait de toute façon jamais atteindre ces actions sans session
 * réelle au préalable (porte unique "Se connecter", voir GuestParticipation.tsx).
 */
export async function requireUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
