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
  await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 4, 1000 Bruxelles");
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

test("footer : lien profil visible pour un vrai compte, masque sur /connexion", async ({ page }) => {
  const hostEmail = `e2e-profile-footer-${Date.now()}@example.com`;
  let hostId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail);
    hostId = host.id;

    await expect(page.getByRole("link", { name: "Modifier mon profil" })).toBeVisible();
    const year = new Date().getFullYear();
    await expect(page.getByText(`Konfeti - ${year} - Belgacai`)).toBeVisible();

    // Signe hors de la session pour retomber sur une page publique, puis
    // navigue vers une route protegee -> redirection /connexion : le lien
    // "Modifier mon profil" ne doit pas y apparaitre (retour Thomas : "est-ce
    // correct ?" -- non, corrige).
    await page.context().clearCookies();
    await page.goto("/creer");
    await expect(page).toHaveURL(/\/connexion/);
    await expect(page.getByRole("link", { name: "Modifier mon profil" })).not.toBeVisible();
  } finally {
    if (hostId) await deleteTestUser(hostId);
  }
});

test("edition du profil (vrai compte) : prerempli, sauvegarde, propagation live sans reload", async ({ page }) => {
  const hostEmail = `e2e-profile-edit-${Date.now()}@example.com`;
  let hostId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail, "/mes-evenements");
    hostId = host.id;
    await page.goto("/profil/completer");
    await page.getByPlaceholder("Julie").fill("Hote");
    await page.getByPlaceholder("Dean").fill("Original");
    await page.getByLabel("Ton numéro de téléphone").fill("+32470000099");
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const title = `E2E profile edit ${Date.now()}`;
    const event = await createTestEvent(page, title);

    // Un message envoye AVANT la modification doit refleter le NOUVEAU nom
    // une fois le profil modifie (retour Thomas : "ca doit se repercuter sur
    // tout le site, le chat, personnes etc").
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await page.getByPlaceholder("Écris un message...").fill("coucou avant modif");
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText("coucou avant modif")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Hote Original")).toBeVisible();

    await page.getByRole("link", { name: "Modifier mon profil" }).click();
    await expect(page).toHaveURL(/\/profil$/);
    await expect(page.locator('input[placeholder="Julie"]')).toHaveValue("Hote");

    await page.locator('input[placeholder="Julie"]').fill("HoteModifie");
    await page.locator('input[placeholder="Dean"]').fill("NomModifie");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Profil mis à jour !")).toBeVisible({ timeout: 10_000 });

    // Retour automatique a la page precedente (retour Thomas : "je suis
    // bloque sur la page").
    await expect(page).toHaveURL(new RegExp(`/e/${event.short_code}$`), { timeout: 10_000 });

    const { data: rsvpRow } = await supabaseAdmin
      .from("rsvps")
      .select("first_name, last_name")
      .eq("event_id", event.id)
      .eq("role", "admin")
      .maybeSingle();
    expect(rsvpRow?.first_name).toBe("HoteModifie");
    expect(rsvpRow?.last_name).toBe("NomModifie");

    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("HoteModifie NomModifie")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Hote Original")).not.toBeVisible();
  } finally {
    if (hostId) await deleteTestUser(hostId);
  }
});

test("un invite anonyme peut modifier son profil, prerempli depuis sa participation", async ({ page, browser }) => {
  const hostEmail = `e2e-profile-anon-host-${Date.now()}@example.com`;
  let hostId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail);
    hostId = host.id;
    const title = `E2E anon profile ${Date.now()}`;
    const event = await createTestEvent(page, title);

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/e/${event.short_code}`);
    await guestPage.getByRole("button", { name: "Continuer sans compte" }).click();
    await guestPage.getByPlaceholder("Julie").fill("Marc");
    await guestPage.getByPlaceholder("Dean").fill("Untel");
    await guestPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000098");
    await guestPage.getByLabel("Un homme").check();
    await guestPage.getByRole("button", { name: "Avatar 2" }).click();
    await guestPage.getByLabel("Je viens !").check();
    await guestPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(guestPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    await expect(guestPage.getByRole("link", { name: "Modifier mon profil" })).toBeVisible();
    await guestPage.getByRole("link", { name: "Modifier mon profil" }).click();
    await expect(guestPage).toHaveURL(/\/profil$/);
    await expect(guestPage.locator('input[placeholder="Julie"]')).toHaveValue("Marc");

    await guestPage.locator('input[placeholder="Julie"]').fill("MarcModifie");
    await guestPage.getByRole("button", { name: "Enregistrer" }).click();
    await expect(guestPage.getByText("Profil mis à jour !")).toBeVisible({ timeout: 10_000 });

    const { data: rsvpRow } = await supabaseAdmin
      .from("rsvps")
      .select("first_name")
      .eq("event_id", event.id)
      .eq("last_name", "Untel")
      .maybeSingle();
    expect(rsvpRow?.first_name).toBe("MarcModifie");

    await guestContext.close();
  } finally {
    if (hostId) await deleteTestUser(hostId);
  }
});

test("mise a niveau anonyme -> compte reel conserve le meme auth.uid() (mecanique cote base)", async () => {
  // Verifie le mecanisme lui-meme (updateUser depuis une session anonyme),
  // independamment de l'UI : reproduit exactement ce que fait `sendMagicLink`
  // quand `user.is_anonymous` est vrai (voir src/app/[locale]/actions/auth.ts).
  const supabaseAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: anonSignIn, error: anonErr } = await supabaseAnon.auth.signInAnonymously();
  if (anonErr || !anonSignIn.user) throw anonErr ?? new Error("signInAnonymously a echoue");
  const anonUserId = anonSignIn.user.id;

  try {
    const email = `e2e-linking-${Date.now()}@example.com`;
    const { error: updateErr } = await supabaseAnon.auth.updateUser(
      { email },
      { emailRedirectTo: "http://localhost:3000/auth/callback" },
    );
    if (updateErr) throw updateErr;

    // La MÊME ligne auth.users (même id) doit porter la demande de
    // changement d'email en attente -- preuve qu'aucun nouveau compte n'a
    // été créé (retour Thomas : "ça va fusionner mon profil anonyme actuel ?").
    const { data: userRow } = await supabaseAdmin
      .schema("auth")
      .from("users")
      .select("id, email_change, is_anonymous")
      .eq("id", anonUserId)
      .maybeSingle();

    expect(userRow?.is_anonymous).toBe(true);
    expect(userRow?.email_change).toBe(email);
  } finally {
    await deleteTestUser(anonUserId);
  }
});

test("mise a niveau anonyme -> compte reel : le formulaire de connexion reussit sans erreur", async ({
  page,
}) => {
  // Etablit une vraie session anonyme via le parcours RSVP normal (pas un
  // raccourci technique), puis emprunte le VRAI chemin UI (LoginForm) pour
  // confirmer que `sendMagicLink` prend bien la branche `updateUser` sans
  // provoquer d'erreur cote serveur.
  const hostEmail = `e2e-linking-host-${Date.now()}@example.com`;
  let hostId: string | null = null;
  let guestId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail);
    hostId = host.id;
    const title = `E2E linking ${Date.now()}`;
    const event = await createTestEvent(page, title);

    const guestContext = await page.context().browser()!.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/e/${event.short_code}`);
    await guestPage.getByRole("button", { name: "Continuer sans compte" }).click();
    await guestPage.getByPlaceholder("Julie").fill("Julie");
    await guestPage.getByPlaceholder("Dean").fill("Untel");
    await guestPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000097");
    await guestPage.getByLabel("Une femme").check();
    await guestPage.getByRole("button", { name: "Avatar 3" }).click();
    await guestPage.getByLabel("Je viens !").check();
    await guestPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(guestPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    const { data: rsvp } = await supabaseAdmin
      .from("rsvps")
      .select("profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Julie")
      .maybeSingle();
    guestId = rsvp?.profile_id ?? null;

    await guestPage.goto("/creer");
    await expect(guestPage).toHaveURL(/\/connexion/);
    const linkingEmail = `e2e-linking-guest-${Date.now()}@example.com`;
    await guestPage.getByLabel("Ton adresse email").fill(linkingEmail);
    await guestPage.getByRole("button", { name: "Recevoir le lien magique" }).click();
    await expect(
      guestPage.getByText("Vérifie ta boîte mail, on t'a envoyé un lien pour te connecter !"),
    ).toBeVisible({ timeout: 10_000 });

    if (guestId) {
      const { data: userRow } = await supabaseAdmin
        .schema("auth")
        .from("users")
        .select("id, email_change, is_anonymous")
        .eq("id", guestId)
        .maybeSingle();
      expect(userRow?.is_anonymous).toBe(true);
      expect(userRow?.email_change).toBe(linkingEmail);
    }

    await guestContext.close();
  } finally {
    if (hostId) await deleteTestUser(hostId);
    if (guestId) await deleteTestUser(guestId);
  }
});
