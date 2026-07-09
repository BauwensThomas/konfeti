"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rate-limit";
import { profileCompletionSchema, type ProfileCompletionInput } from "@/lib/validation/profile";

export type ProfileCompletionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "unknown" | "not_authenticated" };

export async function completeProfile(
  input: ProfileCompletionInput,
  next: string,
): Promise<ProfileCompletionResult> {
  const parsed = profileCompletionSchema.safeParse(input);
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
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone,
      gender: parsed.data.gender,
      avatar_kind: parsed.data.avatarKind,
      avatar_value: parsed.data.avatarValue ?? null,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  redirect(next || "/mes-evenements");
}

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "unknown" | "not_authenticated" | "rate_limited" };

// Édition du profil hors du parcours obligatoire (bouton "Modifier mon
// profil" du footer, voir Footer.tsx) : mêmes champs/validation que
// `completeProfile`, mais ne redirige jamais (l'utilisateur peut être sur
// n'importe quelle page) et répercute le changement sur toute participation
// déjà existante (retour Thomas : "ça doit se répercuter sur tout le site,
// le chat, personnes etc"). `rsvps.first_name`/`avatar_kind`/etc sont une
// COPIE figée au moment de chaque RSVP (voir `create_own_rsvp`/
// `ensure_own_rsvp`), jamais une référence live vers `profiles` — sans cette
// propagation explicite, changer son profil n'aurait aucun effet sur les
// événements déjà rejoints. Jamais les lignes `removed`/`left` (déjà
// anonymisées à dessein, les faire réapparaître serait un vrai bug de
// confidentialité) — la policy `rsvps_update_own` (profile_id = auth.uid())
// autorise déjà ces colonnes en écriture directe, pas besoin d'une fonction
// SQL security definer dédiée.
export async function updateProfile(input: ProfileCompletionInput): Promise<UpdateProfileResult> {
  const parsed = profileCompletionSchema.safeParse(input);
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

  if (isRateLimited(`updateProfile:${user.id}`, 20, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const identity = {
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    phone: parsed.data.phone,
    gender: parsed.data.gender,
    avatar_kind: parsed.data.avatarKind,
    avatar_value: parsed.data.avatarValue ?? null,
  };

  const { error: profileError } = await supabase
    .from("profiles")
    .update(identity)
    .eq("id", user.id);
  if (profileError) {
    return { ok: false, error: "unknown" };
  }

  // `updated_at` n'est PAS accordé en écriture au client (bug réel trouvé en
  // vérifiant : "permission denied for table rsvps" sur tout le update dès
  // que cette colonne était incluse, alors que les colonnes d'identité elles
  // le sont) — jamais l'inclure ici, la ligne reste malgré tout à jour sur
  // les colonnes qui comptent pour l'affichage.
  const { error: rsvpsError } = await supabase
    .from("rsvps")
    .update(identity)
    .eq("profile_id", user.id)
    .in("status", ["pending", "approved", "restricted"]);
  if (rsvpsError) {
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}
