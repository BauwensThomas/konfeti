import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Back-office /admin (Phase 9). Le mot de passe réel n'est jamais connu du
// process de test (seul son hash bcrypt vit dans ADMIN_PASSWORD_HASH) : le
// rejet d'un mauvais mot de passe est testé via le formulaire réel, mais les
// parcours déjà authentifiés injectent directement un cookie de session
// valide -- même principe que `loginAs` (e2e/helpers/auth.ts) qui bypass le
// vrai flux Supabase via une route de test dédiée. Signature dupliquée ici
// (pas importée de `src/lib/admin-auth.ts`) pour ne jamais tirer de modules
// Next.js (`next/headers`) dans le process Playwright.
function adminSessionCookieValue(): string {
  const secret = process.env.ADMIN_SESSION_SECRET!;
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const signature = createHmac("sha256", secret).update(`admin-session:${expiresAt}`).digest("hex");
  return `${expiresAt}.${signature}`;
}

async function loginAsAdmin(context: import("@playwright/test").BrowserContext) {
  await context.addCookies([
    {
      name: "admin_session",
      value: adminSessionCookieValue(),
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("mauvais mot de passe rejeté sur /admin/login", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Mot de passe").fill("ceci-nest-pas-le-bon-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Mot de passe incorrect.")).toBeVisible({ timeout: 10_000 });
  // Toujours sur le formulaire, jamais redirigé vers /admin.
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("session invalide redirige vers /admin/login (proxy)", async ({ page, context }) => {
  await context.addCookies([
    { name: "admin_session", value: "0.deadbeef", url: "http://localhost:3000" },
  ]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("vue d'ensemble, recherche, flags et forcer une validation", async ({ page, context }) => {
  await loginAsAdmin(context);

  // Un événement + une demande en attente à retrouver via la recherche.
  const eventTitle = `Fete admin e2e ${Date.now()}`;
  const { data: hostUser } = await supabaseAdmin.auth.admin.createUser({
    email: `e2e-admin-host-${Date.now()}@example.com`,
    email_confirm: true,
  });
  const { data: event } = await supabaseAdmin
    .from("events")
    .insert({
      title: eventTitle,
      host_id: hostUser!.user!.id,
      date_mode: "fixed",
      starts_at: "2026-12-24T20:00:00Z",
      // Pas de génération automatique en base (voir schema_core.sql) --
      // normalement construit par `createEvent`, ici une valeur directe
      // suffit pour un insert service-role.
      short_code: `E2E-ADMIN-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    })
    .select("id, short_code")
    .single();
  if (!event) throw new Error("evenement introuvable");

  const { data: guestUser } = await supabaseAdmin.auth.admin.createUser({
    email: `e2e-admin-guest-${Date.now()}@example.com`,
    email_confirm: true,
  });
  const { data: rsvp } = await supabaseAdmin
    .from("rsvps")
    .insert({
      event_id: event!.id,
      profile_id: guestUser!.user!.id,
      first_name: "CherchezMoi",
      last_name: "Untel",
      status: "pending",
      role: "guest",
      answer: "yes",
    })
    .select("id")
    .single();

  try {
    // Vue d'ensemble : compteurs visibles.
    await page.goto("/admin");
    await expect(page.getByText("Événements")).toBeVisible();

    // Recherche : trouve l'événement ET le participant en attente.
    await page.getByPlaceholder("Titre d'événement, code, prénom, nom...").fill(eventTitle);
    await page.getByRole("button", { name: "Chercher" }).click();
    await expect(page.getByText(event!.short_code, { exact: false })).toBeVisible({ timeout: 10_000 });

    await page.goto(`/admin?q=CherchezMoi`);
    await expect(page.getByText("CherchezMoi Untel", { exact: false })).toBeVisible({ timeout: 10_000 });

    // Forcer la validation.
    await page.getByRole("button", { name: "Forcer la validation" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", rsvp!.id).single();
        return data?.status;
      })
      .toBe("approved");

    // Feature flags : toggle "Cagnotte" et vérifie le changement en base.
    await page.goto("/admin/flags");
    const { data: before } = await supabaseAdmin.from("feature_flags").select("enabled").eq("key", "pot").single();
    await page.locator("li", { hasText: "Cagnotte" }).getByRole("checkbox").click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("feature_flags").select("enabled").eq("key", "pot").single();
        return data?.enabled;
      })
      .toBe(!before!.enabled);
    // Remis dans l'état d'origine pour ne pas perturber le reste du site.
    await supabaseAdmin.from("feature_flags").update({ enabled: before!.enabled }).eq("key", "pot");
  } finally {
    await supabaseAdmin.from("events").delete().eq("id", event!.id);
    await supabaseAdmin.auth.admin.deleteUser(guestUser!.user!.id);
    await supabaseAdmin.auth.admin.deleteUser(hostUser!.user!.id);
  }
});
