import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { ADMIN_SESSION_COOKIE, verifySessionCookieValue } from "./lib/admin-auth";

const intlMiddleware = createIntlMiddleware(routing);

// Routes qui exigent une session connectée, voir brief 4.1 (création
// réservée aux comptes) et 1.3 (un admin doit avoir un compte). `/profil` et
// `/mes-evenements` (hors de cette liste) gèrent elles-mêmes le cas "aucune
// session du tout" (redirection vers /connexion), seuls `/profil/completer`
// (complétion de profil) et `/creer` sont protégées ici.
const PROTECTED_PREFIXES = ["/creer", "/profil/completer"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// `/admin` (Phase 9, back-office développeur) : hors du segment `[locale]`,
// jamais concerné par next-intl ni par le rafraîchissement de session
// Supabase (pas un compte, un cookie de session signé maison -- voir
// `lib/admin-auth.ts`). Vérifié ICI, en plus du guard dans chaque page
// `/admin/*` : défense en profondeur contre un scan direct des sous-pages
// (brute-force/énumération), retour explicite de Thomas en validant le plan.
function handleAdminRoute(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith("/admin")) return null;
  if (request.nextUrl.pathname === "/admin/login") return NextResponse.next();

  const cookieValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  try {
    if (!verifySessionCookieValue(cookieValue)) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  } catch {
    // ADMIN_SESSION_SECRET manquante ou toute autre erreur inattendue :
    // échec fermé (redirection), jamais un accès accordé par défaut.
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export default async function proxy(request: NextRequest) {
  const adminResponse = handleAdminRoute(request);
  if (adminResponse) return adminResponse;

  const response = intlMiddleware(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Rafraîchit la session (nécessaire dans un Server Component, qui ne peut pas
  // écrire de cookies lui-même) et récupère l'utilisateur courant.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected(request.nextUrl.pathname)) {
    const loginUrl = new URL("/connexion", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
