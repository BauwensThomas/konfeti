import { NextResponse } from "next/server";

// Retour de l'Account Link Stripe (onboarding Connect Express, brief 4.5) --
// simple redirection vers la page événement, jamais utilisé pour déduire
// que l'onboarding est terminé (un retour sur cette URL ne le garantit pas,
// l'utilisateur a pu fermer l'onglet en cours de route). Le VRAI statut
// (`profiles.stripe_onboarding_complete`) est synchronisé uniquement par le
// webhook `account.updated` (voir api/webhooks/stripe/route.ts) -- même
// principe que next-intl qui ajoute le préfixe de locale à tout chemin
// relatif, pas besoin de le faire ici (voir src/app/auth/callback/route.ts).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const shortCode = searchParams.get("shortCode");
  return NextResponse.redirect(`${origin}${shortCode ? `/e/${shortCode}` : "/mes-evenements"}`);
}
