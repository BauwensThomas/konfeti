import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Route réservée aux tests e2e : établit une session à partir d'un couple
 * access_token/refresh_token déjà obtenu (voir e2e/helpers/auth.ts), pour
 * simuler une connexion sans dépasser un vrai clic dans un email. Désactivée
 * en production : ne permet rien qu'on ne puisse déjà faire avec un token
 * valide (pas de nouvelle faille), mais autant ne pas l'exposer inutilement.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const accessToken = searchParams.get("access_token");
  const refreshToken = searchParams.get("refresh_token");
  const next = searchParams.get("next") ?? "/mes-evenements";

  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "missing_tokens" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
