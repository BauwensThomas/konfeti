import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function createTestEvent(page: import("@playwright/test").Page, title: string) {
  await page.getByRole("link", { name: "Créer un événement" }).click();
  await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
  await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
  await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 3, 1000 Bruxelles");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Créer l'événement" }).click();
  await expect(page).toHaveURL(/\/mes-evenements$/);

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, short_code")
    .eq("title", title)
    .maybeSingle();
  if (!event) throw new Error("evenement introuvable");
  return event;
}

async function submitGuestIdentity(
  guestPage: import("@playwright/test").Page,
  shortCode: string,
  firstName: string,
) {
  await guestPage.goto(`/e/${shortCode}`);
  await guestPage.getByRole("button", { name: "Continuer sans compte" }).click();
  await guestPage.getByPlaceholder("Julie").fill(firstName);
  await guestPage.getByPlaceholder("Dean").fill("Untel");
  await guestPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000094");
  await guestPage.getByLabel("Un homme").check();
  await guestPage.getByRole("button", { name: "Avatar 1" }).click();
  await guestPage.getByLabel("Je viens !").check();
  await guestPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
  await expect(guestPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
    timeout: 10_000,
  });
}

async function approveAsRole(
  hostPage: import("@playwright/test").Page,
  shortCode: string,
  firstName: string,
  role: "invité" | "bénéficiaire",
) {
  await hostPage.goto(`/e/${shortCode}`);
  await hostPage.getByRole("button", { name: "Personnes" }).click();
  await hostPage
    .locator("li", { hasText: firstName })
    .getByRole("button", { name: role === "invité" ? "Approuver comme invité" : "Approuver comme bénéficiaire" })
    .click();
}

test("message temps reel, reaction, citation et suppression avec reply_to", async ({ page, browser }) => {
  const hostEmail = `e2e-chat-live-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let guestId: string | null = null;

  try {
    const title = `Fete chat live ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await submitGuestIdentity(guestPage, event.short_code, "Marc");

    const { data: rsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id, profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Marc")
      .maybeSingle();
    guestId = rsvp!.profile_id;

    await approveAsRole(page, event.short_code, "Marc", "invité");

    await guestPage.goto(`/e/${event.short_code}`);
    await guestPage.getByRole("button", { name: "Chat" }).click();

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    // L'abonnement Realtime (websocket) est établi de façon asynchrone après
    // le montage du panneau : laisser un court délai avant de déclencher
    // l'envoi côté invité, sinon le message peut partir avant que l'hôte ne
    // soit effectivement abonné (raté par Realtime, jamais rejoué).
    await page.waitForTimeout(1000);

    // Le message de l'invité doit apparaitre chez l'hote sans reload (Realtime).
    await guestPage.getByPlaceholder("Écris un message...").fill("Salut tout le monde");
    await guestPage.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("Salut tout le monde")).toBeVisible({ timeout: 10_000 });

    // Reaction : l'hote reagit, verifiee en base (source de verite plus robuste
    // que le rendu exact du compteur).
    await page.locator("button", { hasText: "Salut tout le monde" }).first();
    await page.getByRole("button", { name: "Ajouter une réaction" }).first().click();
    await page.getByRole("button", { name: "Pouce levé" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("message_reactions")
          .select("sticker_id")
          .eq("sticker_id", "👍");
        return data?.length ?? 0;
      })
      .toBeGreaterThan(0);

    // L'hote envoie un message, l'invite y repond en citation.
    await page.getByPlaceholder("Écris un message...").fill("Bienvenue !");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(guestPage.getByText("Bienvenue !")).toBeVisible({ timeout: 10_000 });

    const { data: hostMessage } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("event_id", event.id)
      .eq("body", "Bienvenue !")
      .maybeSingle();

    // Cible precisement la bulle de "Bienvenue !" (data-message-id) : la
    // liste contient aussi le message de l'invite lui-meme, dont le bouton
    // "Répondre" apparaitrait en premier dans le DOM sinon. Répondre/Modifier/
    // Supprimer vivent dans un petit menu (3 points), pas une ligne toujours
    // visible (retour Thomas : trop d'espace sinon sous chaque message).
    await guestPage
      .locator(`[data-message-id="${hostMessage!.id}"]`)
      .getByRole("button", { name: "Plus d'actions" })
      .click();
    await guestPage
      .locator(`[data-message-id="${hostMessage!.id}"]`)
      .getByRole("button", { name: "Répondre" })
      .click();
    await guestPage.getByPlaceholder("Écris un message...").fill("Merci !");
    await guestPage.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("Merci !")).toBeVisible({ timeout: 10_000 });

    const { data: replyMessage } = await supabaseAdmin
      .from("messages")
      .select("id, reply_to")
      .eq("event_id", event.id)
      .eq("body", "Merci !")
      .maybeSingle();
    expect(replyMessage?.reply_to).toBe(hostMessage!.id);

    // Edition de son propre message dans les 30 secondes (decision produit :
    // la suppression reste reservee aux admins, voir plus bas).
    await guestPage
      .locator(`[data-message-id="${replyMessage!.id}"]`)
      .getByRole("button", { name: "Plus d'actions" })
      .click();
    await guestPage
      .locator(`[data-message-id="${replyMessage!.id}"]`)
      .getByRole("button", { name: "Modifier" })
      .click();
    await guestPage.locator(`[data-message-id="${replyMessage!.id}"] textarea`).fill("Merci beaucoup !");
    await guestPage
      .locator(`[data-message-id="${replyMessage!.id}"]`)
      .getByRole("button", { name: "Enregistrer" })
      .click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("messages").select("body").eq("id", replyMessage!.id).single();
        return data?.body;
      })
      .toBe("Merci beaucoup !");

    // Suppression reservee aux admins (l'hote est admin) : suppression
    // douce, le message reste en base avec deleted_by_admin=true.
    await page
      .locator(`[data-message-id="${hostMessage!.id}"]`)
      .getByRole("button", { name: "Plus d'actions" })
      .click();
    await page
      .locator(`[data-message-id="${hostMessage!.id}"]`)
      .getByRole("button", { name: "Supprimer" })
      .click();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("messages")
          .select("deleted_by_admin")
          .eq("id", hostMessage!.id)
          .single();
        return data?.deleted_by_admin;
      })
      .toBe(true);

    // Le fix reply_to "on delete set null" reste verifie directement en
    // base (aucune UI ne declenche plus de suppression physique) : un
    // hard-delete via service_role ne doit jamais lever d'erreur FK, et la
    // citation qui pointait dessus doit se retrouver a null.
    await supabaseAdmin.from("messages").delete().eq("id", hostMessage!.id);
    const { data: replyAfterHardDelete } = await supabaseAdmin
      .from("messages")
      .select("reply_to")
      .eq("id", replyMessage!.id)
      .single();
    expect(replyAfterHardDelete?.reply_to).toBeNull();

    await guestContext.close();
  } finally {
    if (eventId) {
      await supabaseAdmin.from("events").delete().eq("id", eventId);
    }
    if (guestId) await deleteTestUser(guestId);
    await deleteTestUser(host.id);
  }
});

test("message systeme, moderation admin, Coulisses masque au beneficiaire, anonymisation", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-chat-mod-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  const guestIds: string[] = [];

  try {
    const title = `Fete chat moderation ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;

    const guest1Context = await browser.newContext();
    const guest1Page = await guest1Context.newPage();
    await submitGuestIdentity(guest1Page, event.short_code, "Julie");
    const { data: rsvp1 } = await supabaseAdmin
      .from("rsvps")
      .select("id, profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Julie")
      .maybeSingle();
    guestIds.push(rsvp1!.profile_id);

    await approveAsRole(page, event.short_code, "Julie", "invité");

    // Message systeme "a rejoint la fete" insere par admin_approve_rsvp.
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("a rejoint la fête", { exact: false })).toBeVisible({ timeout: 10_000 });
    // Laisse l'abonnement Realtime de l'hôte s'établir avant que l'invité
    // n'envoie (voir commentaire équivalent dans le test précédent).
    await page.waitForTimeout(1000);

    // Moderation admin.
    await guest1Page.goto(`/e/${event.short_code}`);
    await guest1Page.getByRole("button", { name: "Chat" }).click();
    await guest1Page.getByPlaceholder("Écris un message...").fill("Coucou");
    await guest1Page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("Coucou")).toBeVisible({ timeout: 10_000 });

    // Les actions (Répondre/Supprimer) ne s'affichent qu'au tap sur le
    // message (retour Thomas : trop d'espace sinon sous chaque message).
    await page.locator("li, div", { hasText: "Coucou" }).getByRole("button", { name: "Plus d'actions" }).first().click();
    await page.locator("li, div", { hasText: "Coucou" }).getByRole("button", { name: "Supprimer" }).first().click();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("messages")
          .select("deleted_by_admin")
          .eq("event_id", event.id)
          .eq("body", "Coucou")
          .single();
        return data?.deleted_by_admin;
      })
      .toBe(true);

    // Beneficiaire designe : Coulisses apparait pour l'hote, jamais pour elle.
    const guest2Context = await browser.newContext();
    const guest2Page = await guest2Context.newPage();
    await submitGuestIdentity(guest2Page, event.short_code, "Sophie");
    const { data: rsvp2 } = await supabaseAdmin
      .from("rsvps")
      .select("id, profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Sophie")
      .maybeSingle();
    guestIds.push(rsvp2!.profile_id);

    await approveAsRole(page, event.short_code, "Sophie", "bénéficiaire");

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByRole("button", { name: "Coulisses" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Coulisses" }).click();
    await page.getByPlaceholder("Écris un message...").fill("Organisons la surprise");
    await page.getByRole("button", { name: "Envoyer" }).click();

    await guest2Page.goto(`/e/${event.short_code}`);
    await guest2Page.getByRole("button", { name: "Chat" }).click();
    await expect(guest2Page.getByRole("button", { name: "Coulisses" })).not.toBeVisible();
    await expect(guest2Page.getByText("Organisons la surprise")).not.toBeVisible();

    // Depart volontaire : le message reste, attribue a "Anonyme".
    await guest1Page.goto(`/e/${event.short_code}`);
    await guest1Page.getByRole("button", { name: "Quitter l'événement" }).click();
    await guest1Page.getByRole("button", { name: "Oui, quitter" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", rsvp1!.id).single();
        return data?.status;
      })
      .toBe("left");

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    // "Anonyme" apparait a la fois sur le message système ("a rejoint la
    // fête") et sur le nom d'auteur affiché sous "Coucou" : les deux
    // confirment le correctif d'anonymisation, .first() suffit ici.
    await expect(page.getByText("Anonyme").first()).toBeVisible({ timeout: 10_000 });

    await guest1Context.close();
    await guest2Context.close();
  } finally {
    if (eventId) {
      await supabaseAdmin.from("events").delete().eq("id", eventId);
    }
    for (const id of guestIds) {
      await deleteTestUser(id);
    }
    await deleteTestUser(host.id);
  }
});
