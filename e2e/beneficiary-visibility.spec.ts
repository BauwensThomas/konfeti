import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function joinAsBeneficiary(
  page: import("@playwright/test").Page,
  hostPage: import("@playwright/test").Page,
  shortCode: string,
  firstName: string,
) {
  await loginAs(page, `${firstName.toLowerCase()}-${Date.now()}@test.konfeti.local`, `/e/${shortCode}`);
  await page.getByPlaceholder("Julie").fill(firstName);
  await page.getByPlaceholder("Dean").fill("Untel");
  await page.getByPlaceholder("+32 470 00 00 00").fill("+32470000091");
  await page.getByLabel("Une femme").check();
  await page.getByRole("button", { name: "Avatar 3" }).click();
  await page.getByLabel("Je viens !").check();
  await page.getByRole("button", { name: "Envoyer ma réponse" }).click();
  await expect(page.getByText("Ta demande est chez l'organisateur !")).toBeVisible({ timeout: 10_000 });

  await hostPage.goto(`/e/${shortCode}`);
  await hostPage.getByRole("button", { name: "Personnes" }).click();
  await hostPage.getByRole("button", { name: "Approuver comme bénéficiaire" }).click();
  await hostPage.waitForTimeout(500);
}

// Retour Thomas : "il faut une étape 5, avec le ou les bénéficiaires peuvent
// voir la cagnotte, le chat, les personnes, qui apporte quoi etc.", précisé
// ensuite : la cagnotte et le fil Coulisses deviennent configurables (au
// lieu de "toujours masqués" codés en dur), le chat GÉNÉRAL reste toujours
// accessible, et les deux onglets Général/Coulisses restent toujours
// visibles même au bénéficiaire ("s'il clique sur coulisses, il faut dire
// vous avez pas accès"). Les notes "X a/n'a pas accès" doivent apparaître
// dans les deux sens, jamais silencieuses (dernier retour de Thomas).
test("la cagnotte et le fil Coulisses sont masqués par défaut au bénéficiaire, l'admin peut les rendre visibles", async ({
  page,
  browser,
}) => {
  // Test étendu ensuite au bloc 'chat' (double aller-retour Modifier
  // supplémentaire) : dépasse désormais le timeout par défaut de 30s.
  test.setTimeout(60_000);
  const hostEmail = `e2e-beneficiary-visibility-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let julieId: string | null = null;

  try {
    const title = `Fete visibilite beneficiaire ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 4 : active la cagnotte (montant libre, pas d'objectif à saisir).
    await page.getByLabel("Ajouter une cagnotte").check();
    await page.getByRole("button", { name: "Montant libre" }).click();
    await page.getByPlaceholder("Cadeau collectif pour Julie").fill("Cadeau pour Julie");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 5 : cagnotte + Coulisses cochées (masquées) par défaut.
    await expect(page.getByText("Ce que voient les bénéficiaires")).toBeVisible();
    const potCheckbox = page.locator("label", { hasText: "Masquer la cagnotte" }).locator("input");
    const backstageCheckbox = page.locator("label", { hasText: "Masquer le fil Coulisses" }).locator("input");
    await expect(potCheckbox).toBeChecked();
    await expect(backstageCheckbox).toBeChecked();

    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, short_code")
      .eq("title", title)
      .maybeSingle();
    if (!event) throw new Error("evenement introuvable");
    eventId = event.id;

    const julieContext = await browser.newContext();
    const juliePage = await julieContext.newPage();
    await joinAsBeneficiary(juliePage, page, event.short_code, "Julie");

    const { data: julieRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Julie")
      .maybeSingle();
    julieId = julieRsvp!.profile_id;

    // Julie (bénéficiaire) ne voit pas la carte cagnotte du tout.
    await juliePage.goto(`/e/${event.short_code}`);
    await expect(juliePage.getByText("Cagnotte : Cadeau pour Julie")).not.toBeVisible();

    // L'hôte, lui, voit la carte + la note "Julie n'a pas accès".
    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText("Cagnotte : Cadeau pour Julie")).toBeVisible();
    await expect(page.getByText("Julie n'a pas accès à la cagnotte.")).toBeVisible();

    // Julie voit les DEUX onglets Général/Coulisses, mais Coulisses lui
    // affiche "pas accès" plutôt que d'être masqué en silence. Général reste
    // accessible (bloc 'chat' décoché par défaut).
    await juliePage.getByRole("button", { name: "Chat" }).click();
    await expect(juliePage.getByRole("button", { name: "Général" })).toBeVisible();
    await expect(juliePage.getByRole("button", { name: "Coulisses" })).toBeVisible();
    await juliePage.getByRole("button", { name: "Coulisses" }).click();
    await expect(juliePage.getByText("Tu n'as pas accès à cette discussion.")).toBeVisible();
    await juliePage.getByRole("button", { name: "Général" }).click();
    await expect(juliePage.getByPlaceholder("Écris un message...")).toBeVisible();

    // L'hôte, dans Coulisses, voit la bannière "Julie n'a pas accès".
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await page.getByRole("button", { name: "Coulisses" }).click();
    await expect(page.getByText("Julie n'a pas accès au fil Coulisses.")).toBeVisible();

    // L'hôte décoche cagnotte/Coulisses mais coche le chat général (bloc
    // 'chat', ajouté après coup -- retour Thomas : un bénéficiaire masqué de
    // Personnes restait quand même visible comme auteur de messages dans le
    // chat général).
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("link", { name: "Modifier", exact: true }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    const potCheckboxEdit = page.locator("label", { hasText: "Masquer la cagnotte" }).locator("input");
    const backstageCheckboxEdit = page.locator("label", { hasText: "Masquer le fil Coulisses" }).locator("input");
    const chatCheckboxEdit = page.locator("label", { hasText: "Masquer le chat général" }).locator("input");
    await potCheckboxEdit.uncheck();
    await backstageCheckboxEdit.uncheck();
    await chatCheckboxEdit.check();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${event.short_code}$`));

    // Julie voit maintenant la cagnotte, et l'hôte voit la note positive.
    await juliePage.goto(`/e/${event.short_code}`);
    await expect(juliePage.getByText("Cagnotte : Cadeau pour Julie")).toBeVisible();

    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText("Julie a accès à la cagnotte.")).toBeVisible();

    // Coulisses fonctionne désormais normalement pour Julie, mais Général
    // lui affiche "pas accès" à la place -- toujours les DEUX onglets
    // visibles, jamais un onglet qui disparaît en silence.
    await juliePage.goto(`/e/${event.short_code}`);
    await juliePage.getByRole("button", { name: "Chat" }).click();
    await expect(juliePage.getByText("Tu n'as pas accès à cette discussion.")).toBeVisible();
    await juliePage.getByRole("button", { name: "Coulisses" }).click();
    await expect(juliePage.getByPlaceholder("Écris un message...")).toBeVisible();

    // L'hôte, sur Général, voit la bannière "Julie n'a pas accès au chat
    // général."
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Julie n'a pas accès au chat général.")).toBeVisible();

    // L'hôte décoche aussi le chat général : tout redevient normal pour
    // Julie.
    await page.goto(`/e/${event.short_code}/modifier`);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.locator("label", { hasText: "Masquer le chat général" }).locator("input").uncheck();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${event.short_code}$`));

    await juliePage.goto(`/e/${event.short_code}`);
    await juliePage.getByRole("button", { name: "Chat" }).click();
    await expect(juliePage.getByPlaceholder("Écris un message...")).toBeVisible();

    await julieContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
    if (julieId) await deleteTestUser(julieId);
  }
});

// Retour Thomas ("les personnes" dans sa liste initiale de blocs) : la liste
// des participants devient elle aussi un bloc masquable, protection
// applicative uniquement (pas de policy RLS dédiée, voir DECISIONS.md).
test("la liste des participants peut être masquée pour le bénéficiaire", async ({ page, browser }) => {
  const hostEmail = `e2e-beneficiary-participants-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let julieId: string | null = null;

  try {
    const title = `Fete masquage personnes ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
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
    eventId = event.id;

    const julieContext = await browser.newContext();
    const juliePage = await julieContext.newPage();
    await joinAsBeneficiary(juliePage, page, event.short_code, "Julie");

    const { data: julieRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Julie")
      .maybeSingle();
    julieId = julieRsvp!.profile_id;

    // Par défaut, Julie voit la liste des participants normalement (en tant
    // que non-admin, elle voit "Julie U" via `rsvps_public_data.last_initial`,
    // jamais le nom de famille complet), avec le compteur "Participants (2)"
    // (Julie + l'hôte, qui a sa propre ligne rsvps créée paresseusement dès
    // qu'il visite sa page événement -- `ensure_own_rsvp`, comportement
    // préexistant, pas lié au masquage bénéficiaire).
    await juliePage.goto(`/e/${event.short_code}`);
    await juliePage.getByRole("button", { name: "Personnes" }).click();
    await expect(juliePage.getByText("Julie U")).toBeVisible();
    await expect(juliePage.getByText("Participants (2)")).toBeVisible();

    // L'hôte, lui, voit la note positive "Julie a accès à la liste des
    // participants." (retour Thomas : "il faut rajouter dans personnes que
    // Julie a accès ou pas", toujours affichée dans les deux sens).
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await expect(page.getByText("Julie a accès à la liste des participants.")).toBeVisible();
    await expect(page.getByText("Participants (2)")).toBeVisible();

    // L'hôte masque la liste depuis Modifier.
    await page.goto(`/e/${event.short_code}/modifier`);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.locator("label", { hasText: "Masquer la liste des participants" }).locator("input").check();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${event.short_code}$`));

    // Julie voit désormais le placeholder à la place de la liste.
    await juliePage.goto(`/e/${event.short_code}`);
    await juliePage.getByRole("button", { name: "Personnes" }).click();
    await expect(juliePage.getByText("L'organisateur a masqué la liste des participants pour toi.")).toBeVisible();

    // L'hôte, lui, continue de voir la liste normalement, avec désormais la
    // note négative "Julie n'a pas accès..." (jamais silencieuse dans l'autre
    // sens non plus).
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await expect(page.getByText("Julie Untel")).toBeVisible();
    await expect(page.getByText("Julie n'a pas accès à la liste des participants.")).toBeVisible();

    await julieContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
    if (julieId) await deleteTestUser(julieId);
  }
});

// Retour Thomas : "dans participer sondages a apporter et cagnotte, on ne
// voit pas cette info" -- la bannière "X a/n'a pas accès" existait déjà sur
// Personnes/Chat/Accueil (cagnotte), mais pas dans les sous-onglets de
// Participer eux-mêmes.
test("les notes d'accès bénéficiaire apparaissent aussi dans Participer (sondages/qui apporte quoi/cagnotte)", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const hostEmail = `e2e-beneficiary-participer-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let julieId: string | null = null;

  try {
    const title = `Fete participer beneficiaire ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 4 : active la cagnotte (montant libre).
    await page.getByLabel("Ajouter une cagnotte").check();
    await page.getByRole("button", { name: "Montant libre" }).click();
    await page.getByPlaceholder("Cadeau collectif pour Julie").fill("Cadeau pour Julie");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 5 : cagnotte masquée par défaut, sondages/"qui apporte quoi" non
    // masqués par défaut -- aucune case à toucher ici.
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, short_code")
      .eq("title", title)
      .maybeSingle();
    if (!event) throw new Error("evenement introuvable");
    eventId = event.id;

    const julieContext = await browser.newContext();
    const juliePage = await julieContext.newPage();
    await joinAsBeneficiary(juliePage, page, event.short_code, "Julie");

    const { data: julieRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Julie")
      .maybeSingle();
    julieId = julieRsvp!.profile_id;

    // Sondages et "qui apporte quoi" : non masqués par défaut, l'hôte doit
    // voir la note positive DANS l'onglet Participer, pas seulement Personnes.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await expect(page.getByText("Julie a accès aux sondages.")).toBeVisible();
    await page.getByRole("button", { name: "À apporter" }).click();
    await expect(page.getByText('Julie a accès à "qui apporte quoi".')).toBeVisible();

    // Cagnotte : masquée par défaut, la note négative doit apparaître ICI
    // aussi, pas seulement sur l'Accueil.
    await page.getByRole("button", { name: "Cagnotte" }).click();
    await expect(page.getByText("Julie n'a pas accès à la cagnotte.")).toBeVisible();

    // Julie, elle, voit désormais un placeholder explicite dans l'onglet
    // Cagnotte (au lieu de l'onglet disparaissant en silence comme avant).
    await juliePage.goto(`/e/${event.short_code}`);
    await juliePage.getByRole("button", { name: "Participer" }).click();
    await juliePage.getByRole("button", { name: "Cagnotte" }).click();
    await expect(juliePage.getByText("L'organisateur a masqué la cagnotte pour toi.")).toBeVisible();

    await julieContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
    if (julieId) await deleteTestUser(julieId);
  }
});
