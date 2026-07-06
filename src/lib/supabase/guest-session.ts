import { createClient } from "@/lib/supabase/server";

/**
 * Garantit une session pour l'appelant (porte 2, brief 1.2) : si personne
 * n'est connecté, crée une session anonyme Supabase à la volée. Un visiteur
 * peut ainsi remplir son identité et répondre sans jamais passer par
 * /connexion ("zéro friction").
 */
export async function ensureGuestSession(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) return null;
  return data.user;
}
