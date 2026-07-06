import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

/**
 * Simule une connexion par magic link sans passer par une vraie boite mail :
 * genere un lien via l'API admin (service_role), l'echange contre une session
 * (verifyOtp), puis etablit cette session dans le navigateur Playwright via
 * la route de test /auth/test-login (voir ce fichier pour le detail).
 */
export async function loginAs(page: Page, email: string, next = "/mes-evenements") {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError || !linkData.properties?.hashed_token) {
    throw linkError ?? new Error("no hashed_token returned");
  }

  const { data: sessionData, error: verifyError } = await supabaseAnon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (verifyError || !sessionData.session) {
    throw verifyError ?? new Error("no session returned");
  }

  const url = new URL("/auth/test-login", "http://localhost:3000");
  url.searchParams.set("access_token", sessionData.session.access_token);
  url.searchParams.set("refresh_token", sessionData.session.refresh_token);
  url.searchParams.set("next", next);

  await page.goto(url.toString());

  return sessionData.session.user;
}

/** Supprime un compte de test cree pour un scenario e2e (nettoyage). */
export async function deleteTestUser(userId: string) {
  await supabaseAdmin.auth.admin.deleteUser(userId);
}
