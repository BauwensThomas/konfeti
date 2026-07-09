import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Point de retour commun au magic link email et à la connexion Google (brief 1.2,
 * double porte). Hors du segment [locale] : c'est un point technique, pas une page.
 * Doit être ajouté dans Supabase Dashboard > Authentication > URL Configuration >
 * Redirect URLs (ex: http://localhost:3000/auth/callback, puis l'URL de prod).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/mes-evenements";

  if (code) {
    const supabase = await createClient();
    const {
      error,
      data: { user },
    } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && user) {
      // Complétion du profil (prénom, nom, téléphone, sexe, avatar)
      // obligatoire après la première connexion, avant d'accéder au reste de
      // l'app (brief 1.1/1.2). `first_name` sert aussi de signal "profil
      // incomplet" pour les comptes créés avant l'ajout de ce champ (identité
      // manquante, affichée "Anonyme" dans le chat par exemple).
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, first_name")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.phone || !profile?.first_name) {
        const completeUrl = new URL("/profil/completer", origin);
        completeUrl.searchParams.set("next", next);
        return NextResponse.redirect(completeUrl);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?error=auth`);
}
