"use server";

import { redirect } from "next/navigation";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { magicLinkSchema } from "@/lib/validation/auth";
import { isRateLimited } from "@/lib/rate-limit";
import { stripe } from "@/lib/stripe";

export type MagicLinkResult =
  | { ok: true }
  | { ok: false; error: "invalid_email" | "unknown" };

// Retour Thomas : "quand on clique sur créer un event, on arrive sur la page
// de connexion si on n'est pas connecté, et sur créer l'event si on est
// connecté" -- `/creer` redirige désormais vers `/connexion?next=/creer` pour
// un visiteur non connecté (voir creer/page.tsx). Ce `next` doit survivre au
// magic link/à Google jusqu'au retour sur `/auth/callback`, qui sait déjà le
// relayer (`searchParams.get("next")`, existant). Jamais une URL absolue
// (open redirect) : seul un chemin relatif commençant par `/` est accepté,
// jamais `//...` (URL "protocol-relative", redirigerait hors du site).
function sanitizeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/mes-evenements";
  }
  return value;
}

export async function sendMagicLink(
  _prevState: MagicLinkResult | null,
  formData: FormData,
): Promise<MagicLinkResult> {
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: "invalid_email" };
  }

  const next = sanitizeNextPath(formData.get("next"));
  const supabase = await createClient();
  const emailRedirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo },
  });

  if (error) {
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}

export async function signInWithGoogle(formData: FormData) {
  const next = sanitizeNextPath(formData.get("next"));
  const supabase = await createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}`;

  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });

  if (error || !data.url) {
    redirect("/connexion?error=auth");
  }

  redirect(data.url);
}

// Bouton "Supprimer mes cookies" (retour Thomas, page Gérer les cookies) :
// l'unique cookie de l'app est la session Supabase -- le supprimer revient à
// se déconnecter. `redirect` ramène tout le monde sur la landing, comme un
// visiteur sans session, jamais une erreur même si `signOut` échoue sur une
// session déjà expirée (rien à perdre à retenter la redirection).
export async function clearSession() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export type DeleteAccountResult =
  | { ok: true }
  | {
      ok: false;
      error: "not_authenticated" | "still_hosting" | "still_owns_pot" | "pending_stripe_balance" | "rate_limited" | "unknown";
    };

// Suppression de compte en libre-service (retour Thomas : "on doit pouvoir
// supprimer son compte, et effacer toutes les données... retirer toutes les
// infos du profil, passer les messages dans le chat en anonyme, retirer le
// vote dans les sondages, de qui apporte quoi avec les +1 compris"), brief
// section 9/4.8. Deux étapes distinctes : `delete_own_account` (RPC, session
// de l'appelant) nettoie/anonymise toutes les participations -- ELLE SEULE
// connaît `auth.uid()` correctement ; puis `auth.admin.deleteUser` (client
// service_role, même pattern que les routes cron) supprime réellement le
// compte, ce que seul ce rôle élevé peut faire. `profiles` est supprimée en
// cascade (`profiles.id references auth.users on delete cascade`).
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`deleteAccount:${user.id}`, 5, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  // Garde-fou cagnotte (brief 4.8) : "solde Stripe à zéro" ne peut pas être
  // vérifié en SQL pur (il faut interroger l'API Stripe en direct) -- fait
  // ICI, avant `delete_own_account` (qui, elle, bloque déjà la partie
  // "aucune cagnotte active" en SQL). Un compte Stripe jamais créé ou sans
  // solde ne bloque jamais la suppression.
  const { data: profile } = await supabase.from("profiles").select("stripe_account_id").eq("id", user.id).maybeSingle();
  if (profile?.stripe_account_id) {
    try {
      const balance = await stripe.balance.retrieve({}, { stripeAccount: profile.stripe_account_id });
      const hasFunds = [...balance.available, ...balance.pending].some((b) => b.amount > 0);
      if (hasFunds) {
        return { ok: false, error: "pending_stripe_balance" };
      }
    } catch {
      // Jamais bloquant si Stripe est injoignable -- le garde-fou SQL
      // (cagnotte active) reste la vraie barrière de sécurité.
    }
  }

  const { error: cleanupError } = await supabase.rpc("delete_own_account");
  if (cleanupError) {
    return {
      ok: false,
      error: cleanupError.message.includes("still hosting")
        ? "still_hosting"
        : cleanupError.message.includes("still owns an active pot")
          ? "still_owns_pot"
          : "unknown",
    };
  }

  const serviceRoleClient = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { error: deleteError } = await serviceRoleClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return { ok: false, error: "unknown" };
  }

  await supabase.auth.signOut();
  return { ok: true };
}
