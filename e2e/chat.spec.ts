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

    const { data: coucouMessage } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("event_id", event.id)
      .eq("body", "Coucou")
      .maybeSingle();

    // Les actions (Répondre/Supprimer) ne s'affichent qu'au tap sur le
    // message (retour Thomas : trop d'espace sinon sous chaque message).
    // Ciblé via `data-message-id` (comme le test précédent) plutôt qu'un
    // `"li, div", { hasText: "Coucou" }` générique : ce dernier matche TOUS
    // les ancêtres div contenant ce texte jusqu'à un div très haut dans la
    // page, et `.first()` peut alors résoudre un bouton totalement étranger
    // partageant un sous-texte ("Supprimer" matchait "Supprimer l'événement"
    // du bandeau de la page, en substring) — bug de test latent révélé par
    // un changement de structure DOM du chat, pas une régression fonctionnelle.
    await page
      .locator(`[data-message-id="${coucouMessage!.id}"]`)
      .getByRole("button", { name: "Plus d'actions" })
      .click();
    await page
      .locator(`[data-message-id="${coucouMessage!.id}"]`)
      .getByRole("button", { name: "Supprimer", exact: true })
      .click();
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

    // Beneficiaire designee : Coulisses reste TOUJOURS visible (redesign
    // documente dans DECISIONS.md -- plus jamais un onglet qui disparait en
    // silence), seul son CONTENU est remplace par un message d'acces refuse.
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
    await expect(guest2Page.getByRole("button", { name: "Coulisses" })).toBeVisible();
    await guest2Page.getByRole("button", { name: "Coulisses" }).click();
    await expect(guest2Page.getByText("Tu n'as pas accès à cette discussion.")).toBeVisible();
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

// Retour de "Claude" transmis par Thomas : l'envoi d'un message faisait un
// aller-retour complet (Postgres + Realtime) avant de s'afficher, même pour
// son PROPRE expéditeur -- délai perçu ~200-500ms. Optimistic UI ajoutée
// (ChatRoom.handleOptimisticSend/handleSendSettled, même principe déjà en
// place pour les réactions) : la bulle doit apparaître avant même que le
// serveur ne réponde. Vérifié en ralentissant artificiellement la Server
// Action (route interceptée) : si la bulle apparaît alors que la réponse
// réseau est encore volontairement bloquée, l'affichage est bien local, pas
// piloté par la confirmation serveur ni par l'écho Realtime.
test("l'envoi d'un message affiche la bulle immédiatement, avant la réponse du serveur", async ({
  page,
}) => {
  const hostEmail = `e2e-chat-optimistic-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Fete chat optimistic ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    // Le composer n'apparaît qu'une fois `ensureMyChatRsvpId` résolu (l'hôte
    // n'a pas de ligne rsvps automatique, voir ChatRoom) : attendre qu'il
    // soit prêt AVANT d'installer le ralentissement réseau ci-dessous, sinon
    // ce tout premier appel serait lui aussi retardé pour rien.
    await expect(page.getByPlaceholder("Écris un message...")).toBeVisible({ timeout: 10_000 });

    // Ralentit uniquement les Server Actions (identifiables par l'en-tête
    // `next-action`), pas les autres requêtes (assets, RSC de navigation) :
    // un délai global aurait aussi retardé le montage du panneau lui-même.
    await page.route("**/*", async (route) => {
      const isServerAction = route.request().headers()["next-action"] !== undefined;
      if (isServerAction) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
      await route.continue();
    });

    await page.getByPlaceholder("Écris un message...").fill("Message optimiste");
    await page.getByRole("button", { name: "Envoyer" }).click();

    // La bulle et son statut "Envoi..." doivent être visibles bien avant les
    // 2500ms de délai réseau artificiel imposé ci-dessus.
    await expect(page.getByText("Message optimiste")).toBeVisible({ timeout: 500 });
    await expect(page.getByText("Envoi...")).toBeVisible({ timeout: 500 });

    // Une fois la Server Action confirmée (après le délai), le statut
    // "Envoi..." disparaît (réconciliation avec l'id réel, voir
    // ChatRoom.handleSendSettled) et le message est bien persisté en base.
    await expect(page.getByText("Envoi...")).not.toBeVisible({ timeout: 5_000 });
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("event_id", event.id)
          .eq("body", "Message optimiste")
          .maybeSingle();
        return data?.id ?? null;
      })
      .not.toBeNull();
  } finally {
    if (eventId) {
      await supabaseAdmin.from("events").delete().eq("id", eventId);
    }
    await deleteTestUser(host.id);
  }
});

// Retour Thomas : "quand on clic sur le message où quelqu'un a mis répondre,
// on est envoyé directement à la hauteur du message et il clignote avec un
// contour orange pendant 5 secondes" -- ChatRoom.scrollToAndHighlight.
test("cliquer sur une citation scrolle vers le message original et le met en surbrillance orange 5s", async ({
  page,
}) => {
  const hostEmail = `e2e-chat-jump-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Fete chat jump ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByPlaceholder("Écris un message...")).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder("Écris un message...").fill("Message original");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("Message original")).toBeVisible({ timeout: 10_000 });

    // L'affichage est désormais optimiste (bulle visible avant la réponse du
    // serveur, voir "envoi d'un message affiche la bulle immédiatement"
    // ci-dessus) : la ligne peut ne pas encore exister en base au moment où
    // le texte est déjà visible à l'écran, `expect.poll` plutôt qu'une seule
    // lecture directe.
    let originalMessage: { id: string } | null = null;
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("event_id", event.id)
          .eq("body", "Message original")
          .maybeSingle();
        originalMessage = data;
        return data?.id ?? null;
      })
      .not.toBeNull();

    await page
      .locator(`[data-message-id="${originalMessage!.id}"]`)
      .getByRole("button", { name: "Plus d'actions" })
      .click();
    await page
      .locator(`[data-message-id="${originalMessage!.id}"]`)
      .getByRole("button", { name: "Répondre" })
      .click();
    await page.getByPlaceholder("Écris un message...").fill("Réponse au message original");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("Réponse au message original")).toBeVisible({ timeout: 10_000 });

    // Clic sur la citation affichée au-dessus de la réponse : doit ramener
    // à la hauteur du message original et le mettre en surbrillance.
    await page.getByRole("button", { name: /Message original/ }).click();
    const highlighted = page.locator(`[data-message-id="${originalMessage!.id}"] .chat-highlight`);
    await expect(highlighted).toBeVisible();
    // Disparaît d'elle-même après 5 secondes (setTimeout, voir ChatRoom).
    await expect(highlighted).toBeHidden({ timeout: 6_000 });
  } finally {
    if (eventId) {
      await supabaseAdmin.from("events").delete().eq("id", eventId);
    }
    await deleteTestUser(host.id);
  }
});

// Retour Thomas : "je veux avoir tout les messages de la conversation",
// confirmé : "quand j'arrive en haut, ça charge les 50 précédents, et
// ensuite les 50 etc etc" -- scroll infini vers le haut (ChatRoom.
// loadOlderMessages), 50 messages par page jusqu'à épuisement de l'historique.
test("scroller vers le haut charge les messages plus anciens, 50 par 50", async ({ page }) => {
  const hostEmail = `e2e-chat-pagination-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Fete chat pagination ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;

    // Ouvre le chat une première fois pour que l'hôte ait sa ligne rsvps
    // (ensure_own_rsvp, paresseux) avant d'insérer les messages directement.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByPlaceholder("Écris un message...")).toBeVisible({ timeout: 10_000 });

    const { data: hostRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id")
      .eq("event_id", event.id)
      .eq("profile_id", host.id)
      .single();

    // 120 messages insérés directement en base (bien plus rapide que 120
    // envois via l'UI), horodatés en ordre croissant.
    const now = Date.now();
    const rows = Array.from({ length: 120 }, (_, i) => ({
      event_id: event.id,
      rsvp_id: hostRsvp!.id,
      channel: "main" as const,
      body: `Message historique ${i + 1}`,
      created_at: new Date(now - (120 - i) * 60_000).toISOString(),
    }));
    await supabaseAdmin.from("messages").insert(rows);

    // Recharge la page pour que le Server Component EventChat charge les 50
    // derniers messages fraîchement insérés.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Message historique 120")).toBeVisible({ timeout: 10_000 });

    const countLoaded = () => page.locator("[data-message-id]").count();
    expect(await countLoaded()).toBe(50);

    async function scrollToTop() {
      await page.evaluate(() => {
        const list = document.querySelector("[data-message-id]")?.closest(".overflow-y-auto");
        if (list) list.scrollTop = 0;
      });
    }

    await scrollToTop();
    await expect.poll(countLoaded, { timeout: 10_000 }).toBe(100);

    await scrollToTop();
    await expect.poll(countLoaded, { timeout: 10_000 }).toBe(120);

    // Plus rien à charger au-delà (seulement 120 messages au total) : un
    // dernier scroll ne doit rien changer.
    await scrollToTop();
    await page.waitForTimeout(1000);
    expect(await countLoaded()).toBe(120);

    await expect(page.getByText("Message historique 1", { exact: true })).toBeVisible();
  } finally {
    if (eventId) {
      await supabaseAdmin.from("events").delete().eq("id", eventId);
    }
    await deleteTestUser(host.id);
  }
});

// Retour Thomas : "je vois message non lu, j'ai vu les messages mais si je
// reviens sur accueil ou personnes ou participer et que je reviens dans le
// chat, message non lu reste toujours affiché au même endroit" -- la ligne
// ne doit apparaître qu'une fois, jamais se réafficher après un aller-retour
// vers un autre onglet dans la même session (voir lastRead.ts).
test("la ligne 'messages non lus' ne réapparaît pas après un aller-retour vers un autre onglet", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-chat-unread-persist-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let guestId: string | null = null;

  try {
    const title = `Fete chat unread persist ${Date.now()}`;
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
    await guestPage.getByPlaceholder("Écris un message...").fill("Un message non lu pour l'hote");
    await guestPage.getByRole("button", { name: "Envoyer" }).click();
    await expect(guestPage.getByText("Un message non lu pour l'hote")).toBeVisible({ timeout: 10_000 });

    // L'hôte ouvre le chat pour la première fois : doit voir la ligne "non lus".
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Un message non lu pour l'hote")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Messages non lus")).toBeVisible();

    // Accueil, puis retour sur Chat : la ligne ne doit plus s'afficher.
    await page.getByRole("button", { name: "Accueil" }).click();
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Un message non lu pour l'hote")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Messages non lus")).not.toBeVisible();

    // Personnes, puis retour : toujours pas de ligne (pas un coup de chance).
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Messages non lus")).not.toBeVisible();

    await guestContext.close();
  } finally {
    if (eventId) {
      await supabaseAdmin.from("events").delete().eq("id", eventId);
    }
    if (guestId) await deleteTestUser(guestId);
    await deleteTestUser(host.id);
  }
});
