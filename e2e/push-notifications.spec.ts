import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Le réglage push (`PushNotificationSettings`) n'a de sens QUE si l'app
// tourne en mode installé (`display-mode: standalone`) -- sur iPhone le Web
// Push ne fonctionne QUE dans ce mode. On force cette détection via
// `matchMedia`, seule façon fiable de le simuler dans un navigateur de test
// classique (pas de vraie installation PWA possible sous Playwright).
async function forceStandaloneMode(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query === "(display-mode: standalone)") {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return original(query);
    };
  });
}

// Chrome refuse délibérément l'API Push dans un contexte "incognito"
// (https://crbug.com/41124656, sans façon de le feature-detecter) -- exactement
// le type de contexte que Playwright utilise par défaut. Même en contournant
// ça (profil persistant), le service de push natif de Chromium reste
// injoignable dans cet environnement ("push service not available"). Seule
// `PushManager.subscribe()` elle-même est donc simulée ici (le SEUL point
// impossible à tester dans ces conditions) -- l'enregistrement du service
// worker, la permission navigateur, l'action serveur, l'écriture en base et
// les 4 réglages restent, eux, entièrement réels.
async function stubPushManagerSubscribe(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    let fakeSubscription: { endpoint: string; toJSON: () => unknown; unsubscribe: () => Promise<boolean> } | null =
      null;

    function makeFakeSubscription() {
      const endpoint = `https://fake-push-endpoint.example.com/${Math.random().toString(36).slice(2)}`;
      const sub = {
        endpoint,
        toJSON: () => ({
          endpoint,
          keys: { p256dh: `fake-p256dh-${Math.random().toString(36).slice(2)}`, auth: `fake-auth-${Math.random().toString(36).slice(2)}` },
        }),
        unsubscribe: async () => {
          fakeSubscription = null;
          return true;
        },
      };
      return sub;
    }

    if (typeof PushManager !== "undefined") {
      PushManager.prototype.subscribe = async function () {
        fakeSubscription = makeFakeSubscription();
        return fakeSubscription as unknown as PushSubscription;
      };
      PushManager.prototype.getSubscription = async function () {
        return fakeSubscription as unknown as PushSubscription;
      };
    }
  });
}

test("le reglage notifications push n'apparait que si l'app tourne en mode installe", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-push-standalone-${Date.now()}@example.com`;
  const user = await loginAs(page, email, "/profil");

  try {
    await expect(page.getByText("Notifications sur cet appareil")).not.toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});

test("abonnement, preferences par categorie et desabonnement aux notifications push", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["notifications"]);
  await forceStandaloneMode(page);
  await stubPushManagerSubscribe(page);

  const email = `e2e-push-settings-${Date.now()}@example.com`;
  const user = await loginAs(page, email, "/profil");

  try {
    const enableButton = page.getByRole("button", { name: "Activer les notifications" });
    await expect(enableButton).toBeVisible({ timeout: 10_000 });
    await enableButton.click();

    // L'abonnement crée une vraie ligne push_subscriptions (endpoint généré
    // par le navigateur), pas un mock -- même exigence que le reste des
    // tests e2e du projet (retour Thomas : "toujours créer de vrais tests
    // e2e").
    await expect
      .poll(async () => {
        const { count } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        return count ?? 0;
      })
      .toBeGreaterThan(0);

    // Les 4 catégories sont cochées par défaut (retour Thomas : "doit être
    // coché de base mais décochable si besoin").
    const invitationsToggle = page.getByLabel("Réponses & invitations");
    const chatToggle = page.getByLabel("Chat", { exact: true });
    await expect(invitationsToggle).toBeChecked();
    await expect(chatToggle).toBeChecked();

    await chatToggle.uncheck();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("profiles").select("push_notif_chat").eq("id", user.id).single();
        return data?.push_notif_chat;
      })
      .toBe(false);

    await chatToggle.check();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("profiles").select("push_notif_chat").eq("id", user.id).single();
        return data?.push_notif_chat;
      })
      .toBe(true);

    await page.getByRole("button", { name: "Désactiver les notifications" }).click();
    await expect
      .poll(async () => {
        const { count } = await supabaseAdmin
          .from("push_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        return count ?? 0;
      })
      .toBe(0);
    await expect(page.getByRole("button", { name: "Activer les notifications" })).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
