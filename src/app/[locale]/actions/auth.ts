"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { magicLinkSchema } from "@/lib/validation/auth";

export type MagicLinkResult =
  | { ok: true }
  | { ok: false; error: "invalid_email" | "email_taken" | "unknown" };

// Une session anonyme "code d'accès" (brief 1.2 : "création de compte plus
// tard, rien n'est perdu") doit être MISE À NIVEAU vers un compte permanent,
// pas remplacée par un compte tout neuf sans lien avec elle. `signInWithOtp`/
// `signInWithOAuth` créent (ou retrouvent) toujours un utilisateur SÉPARÉ,
// même appelés depuis une session anonyme active — aucun des deux ne
// "fusionne" quoi que ce soit (bug réel signalé par Thomas : "ça va fusionner
// mon profil anonyme actuel ?" — non, avant ce correctif). `updateUser`/
// `linkIdentity` sont les méthodes Supabase dédiées à cette mise à niveau :
// appelées depuis la session anonyme en cours, elles rattachent l'identité
// email/Google au MÊME `auth.uid()` (donc aux mêmes lignes `rsvps` déjà
// existantes) plutôt que d'en créer un nouveau. Jamais utilisées s'il n'y a
// pas de session anonyme active (visiteur direct sur /connexion) : comportement
// inchangé dans ce cas.
export async function sendMagicLink(
  _prevState: MagicLinkResult | null,
  formData: FormData,
): Promise<MagicLinkResult> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: "invalid_email" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const emailRedirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;

  const { error } =
    user?.is_anonymous
      ? await supabase.auth.updateUser({ email: parsed.data.email }, { emailRedirectTo })
      : await supabase.auth.signInWithOtp({
          email: parsed.data.email,
          options: { emailRedirectTo },
        });

  if (error) {
    // Email déjà utilisé par un AUTRE compte permanent : Supabase le
    // rapporte comme une erreur distincte sur `updateUser` (jamais sur
    // `signInWithOtp`, qui retrouve silencieusement le compte existant) —
    // dans ce cas précis, la session anonyme ne peut pas être mise à niveau
    // vers cet email (il appartient déjà à quelqu'un d'autre).
    if (user?.is_anonymous && error.code === "email_exists") {
      return { ok: false, error: "email_taken" };
    }
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;

  const { data, error } = user?.is_anonymous
    ? await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo } })
    : await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });

  if (error || !data.url) {
    redirect("/connexion?error=auth");
  }

  redirect(data.url);
}
