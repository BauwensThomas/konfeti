import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

// Routes qui exigent un compte réel (pas une session anonyme d'invité "code d'accès"),
// voir brief 4.1 (création réservée aux comptes) et 1.3 (un admin doit avoir un compte).
const PROTECTED_PREFIXES = ["/mes-evenements", "/creer", "/profil"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default async function proxy(request: NextRequest) {
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

  const hasRealAccount = !!user && !user.is_anonymous;

  if (!hasRealAccount && isProtected(request.nextUrl.pathname)) {
    const loginUrl = new URL("/connexion", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
