import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Un item "qui apporte quoi" est rendu dans une `div.rounded-konfeti` -- la
// même classe que la Card qui l'englobe (elle contient donc, elle aussi,
// tous les libellés d'items) : `.last()` élimine cet englobant et cible la
// ligne de l'item précis, seule à réellement contenir SON libellé parmi les
// éléments filtrés (voir BringListClient.tsx).
function bringItemRow(page: Page, label: string) {
  return page.locator("div.rounded-konfeti").filter({ hasText: label }).last();
}

async function selectUnit(page: Page, buttonName: string, unitLabel: string) {
  await page.getByRole("button", { name: buttonName }).click();
  await page.getByRole("button", { name: unitLabel, exact: true }).click();
}

test("proposition d'item par un invite, moderation (approbation avec reclamation auto, fusion, refus) et edition admin", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const hostEmail = `e2e-bring-list-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete qui apporte quoi ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 4 : un item défini par l'organisateur au wizard (comportement
    // historique, `status` = 'approved' d'office).
    await page.getByRole("button", { name: "Ajouter un produit" }).click();
    await page.getByPlaceholder("Ex. Bouteilles de soda, gâteau, glaçons...").fill("Bouteilles de soda");
    await page.getByLabel("Quantité demandée pour l'item 1").fill("6");
    await selectUnit(page, "Unité pour l'item 1", "Pièce(s)");

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

    // Marc rejoint et est approuvé comme invité normal (pas bénéficiaire).
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Continuer sans compte" }).click();
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000094");
    await marcPage.getByLabel("Un homme").check();
    await marcPage.getByRole("button", { name: "Avatar 1" }).click();
    await marcPage.getByLabel("Je viens !").check();
    await marcPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(marcPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({ timeout: 10_000 });

    const { data: marcRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id, profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Marc")
      .maybeSingle();
    marcId = marcRsvp!.profile_id;

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("approved");

    // Marc voit l'item du wizard, à 0, et réclame 2 pièces.
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await expect(marcPage.getByText("0 pièce / 6 pièces")).toBeVisible();
    await marcPage.getByLabel("Ma quantité").fill("2");
    await marcPage.getByRole("button", { name: "J'apporte" }).click();
    await expect(marcPage.getByText("2 pièces / 6 pièces")).toBeVisible({ timeout: 15_000 });

    // Marc propose un nouvel item -- le message de confirmation est transitoire
    // (retour Thomas : il restait affiché indéfiniment), et l'item en attente
    // ne lui est jamais renvoyé par RLS (visible seulement à l'admin). Le
    // formulaire est désormais dans un popup (retour Thomas : trop de place
    // prise sur mobile), ouvert via son bouton déclencheur.
    await marcPage.getByRole("button", { name: "Proposer un item" }).click();
    await marcPage.getByPlaceholder("Ex. Glaçons, jus d'orange...").fill("Jus d'orange");
    await marcPage.getByLabel("Quantité proposée").fill("3");
    await selectUnit(marcPage, "Unité proposée", "Litre(s)");
    await marcPage.getByRole("button", { name: "Proposer", exact: true }).click();
    const proposeSuccess = marcPage.getByText("Merci ! Ta proposition attend la validation de l'organisateur.");
    await expect(proposeSuccess).toBeVisible({ timeout: 15_000 });
    await expect(marcPage.getByText("Jus d'orange")).not.toBeVisible();
    await expect(proposeSuccess).toBeHidden({ timeout: 6_000 });

    // L'hôte modère : voit la section "en attente", le nom du proposant, et
    // approuver crée automatiquement une réclamation pour Marc à sa quantité
    // d'origine (retour Thomas : "quand quelqu'un demande... c'est qu'il va
    // ramener ça").
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await expect(page.getByText("En attente d'approbation")).toBeVisible();
    await expect(page.getByText("Jus d'orange : 3 L")).toBeVisible();
    await expect(page.getByText("Proposé par Marc Untel")).toBeVisible();
    await page.getByRole("button", { name: "Approuver" }).click();
    await expect(page.getByText("3 L / 3 L")).toBeVisible({ timeout: 15_000 });

    const { data: jusItem } = await supabaseAdmin
      .from("bring_items")
      .select("id, status")
      .eq("event_id", event.id)
      .eq("label", "Jus d'orange")
      .single();
    expect(jusItem!.status).toBe("approved");
    const { data: autoClaim } = await supabaseAdmin
      .from("bring_claims")
      .select("quantity")
      .eq("item_id", jusItem!.id)
      .eq("rsvp_id", marcRsvp!.id)
      .single();
    expect(autoClaim!.quantity).toBe(3);

    // Marc propose un doublon d'un item déjà existant -- l'hôte fusionne au
    // lieu d'approuver comme nouvel item (retour Thomas : "l'admin doit
    // pouvoir choisir... si quelqu'un a déjà proposé ce produit"). La
    // réclamation de Marc sur l'item cible est mise à jour à SA quantité de
    // la proposition en double (4), pas cumulée avec son ancienne (2).
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await marcPage.getByRole("button", { name: "Proposer un item" }).click();
    await marcPage.getByPlaceholder("Ex. Glaçons, jus d'orange...").fill("Bouteilles de soda");
    await marcPage.getByLabel("Quantité proposée").fill("4");
    await selectUnit(marcPage, "Unité proposée", "Pièce(s)");
    await marcPage.getByRole("button", { name: "Proposer", exact: true }).click();

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await expect(page.getByText("Bouteilles de soda : 4 pièces")).toBeVisible();
    await page.getByRole("button", { name: "Fusionner" }).click();
    const mergeDialog = page.getByRole("dialog");
    await expect(mergeDialog.getByText("Fusionner avec quel item ?")).toBeVisible();
    await mergeDialog.getByRole("button", { name: "Bouteilles de soda", exact: true }).click();
    await expect(page.getByText("4 pièces / 6 pièces")).toBeVisible({ timeout: 15_000 });

    const { data: sodaItems } = await supabaseAdmin
      .from("bring_items")
      .select("id, status")
      .eq("event_id", event.id)
      .eq("label", "Bouteilles de soda");
    expect(sodaItems).toHaveLength(1);
    expect(sodaItems![0].status).toBe("approved");
    const { data: mergedClaim } = await supabaseAdmin
      .from("bring_claims")
      .select("quantity")
      .eq("item_id", sodaItems![0].id)
      .eq("rsvp_id", marcRsvp!.id)
      .single();
    expect(mergedClaim!.quantity).toBe(4);

    // L'hôte modifie directement la quantité demandée d'un item déjà approuvé.
    const jusRow = bringItemRow(page, "Jus d'orange");
    await jusRow.getByLabel("Quantité demandée (organisateur)").fill("5");
    await jusRow.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("3 L / 5 L")).toBeVisible({ timeout: 15_000 });

    const { data: jusUpdated } = await supabaseAdmin
      .from("bring_items")
      .select("quantity_needed")
      .eq("id", jusItem!.id)
      .single();
    expect(jusUpdated!.quantity_needed).toBe(5);

    // L'hôte supprime directement cet item.
    const jusRow2 = bringItemRow(page, "Jus d'orange");
    await jusRow2.getByRole("button", { name: "Supprimer l'item" }).click();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();
    await expect(page.getByText("Jus d'orange")).not.toBeVisible({ timeout: 15_000 });

    const { data: jusAfterDelete } = await supabaseAdmin
      .from("bring_items")
      .select("id")
      .eq("id", jusItem!.id)
      .maybeSingle();
    expect(jusAfterDelete).toBeNull();

    // Marc propose un dernier item, refusé cette fois : suppression
    // définitive, jamais renvoyé à personne.
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await marcPage.getByRole("button", { name: "Proposer un item" }).click();
    await marcPage.getByPlaceholder("Ex. Glaçons, jus d'orange...").fill("Bonbons");
    await marcPage.getByLabel("Quantité proposée").fill("1");
    await selectUnit(marcPage, "Unité proposée", "Pièce(s)");
    await marcPage.getByRole("button", { name: "Proposer", exact: true }).click();

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await expect(page.getByText("Bonbons : 1 pièce")).toBeVisible();
    await page.getByRole("button", { name: "Refuser" }).click();
    await expect(page.getByText("Bonbons")).not.toBeVisible({ timeout: 15_000 });

    const { data: bonbonsAfterReject } = await supabaseAdmin
      .from("bring_items")
      .select("id")
      .eq("event_id", event.id)
      .eq("label", "Bonbons")
      .maybeSingle();
    expect(bonbonsAfterReject).toBeNull();

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});

// Bug réel signalé par Thomas : "j'ai un utilisateur qui a dit qu'il allait
// ramener 3 litres de vodka, après il a marqué qu'il venait pas et pourtant
// j'ai toujours son nom avec 3 litres de vodka." `leave_or_remove_participant`
// nettoyait déjà `bring_claims` en quittant/étant retiré, mais pas le chemin
// "Je ne peux pas" (`update_my_answer`, answer='no' -> status='restricted'),
// qui laisse le participant sur l'événement mais restreint -- corrigé par la
// migration 20260710002600_clear_bring_claims_on_restricted.sql.
test("dire 'je ne peux pas' retire automatiquement les réclamations déjà prises sur qui apporte quoi", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const hostEmail = `e2e-bring-restricted-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete vodka ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 2, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Ajouter un produit" }).click();
    await page.getByPlaceholder("Ex. Bouteilles de soda, gâteau, glaçons...").fill("Vodka");
    await page.getByLabel("Quantité demandée pour l'item 1").fill("3");
    await selectUnit(page, "Unité pour l'item 1", "Litre(s)");

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

    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Continuer sans compte" }).click();
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000093");
    await marcPage.getByLabel("Un homme").check();
    await marcPage.getByRole("button", { name: "Avatar 1" }).click();
    await marcPage.getByLabel("Je viens !").check();
    await marcPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(marcPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({ timeout: 10_000 });

    const { data: marcRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id, profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Marc")
      .maybeSingle();
    marcId = marcRsvp!.profile_id;

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("approved");

    // Marc réclame les 3 litres de vodka.
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await marcPage.getByLabel("Ma quantité").fill("3");
    await marcPage.getByRole("button", { name: "J'apporte" }).click();
    await expect(marcPage.getByText("3 L / 3 L")).toBeVisible({ timeout: 15_000 });

    const { data: vodkaItem } = await supabaseAdmin
      .from("bring_items")
      .select("id")
      .eq("event_id", event.id)
      .eq("label", "Vodka")
      .single();
    const { data: claimBefore } = await supabaseAdmin
      .from("bring_claims")
      .select("id")
      .eq("item_id", vodkaItem!.id)
      .eq("rsvp_id", marcRsvp!.id)
      .maybeSingle();
    expect(claimBefore).not.toBeNull();

    // Marc propose aussi un nouveau produit, encore en attente de modération
    // (retour Thomas : "celui en attente doit disparaitre aussi, c'est
    // logique non ?" -- une proposition n'a de sens que parce que le
    // proposant comptait venir).
    await marcPage.getByRole("button", { name: "Proposer un item" }).click();
    await marcPage.getByPlaceholder("Ex. Glaçons, jus d'orange...").fill("Chips");
    await marcPage.getByLabel("Quantité proposée").fill("2");
    await selectUnit(marcPage, "Unité proposée", "Pièce(s)");
    await marcPage.getByRole("button", { name: "Proposer", exact: true }).click();
    await expect(
      marcPage.getByText("Merci ! Ta proposition attend la validation de l'organisateur."),
    ).toBeVisible({ timeout: 15_000 });

    const { data: chipsItemBefore } = await supabaseAdmin
      .from("bring_items")
      .select("id")
      .eq("event_id", event.id)
      .eq("label", "Chips")
      .maybeSingle();
    expect(chipsItemBefore).not.toBeNull();

    // Marc change sa réponse : "Je ne peux pas" (contrôle affiché directement
    // sur l'Accueil, voir MyParticipationCard.tsx).
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Je ne peux pas" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("restricted");

    const { data: claimAfter } = await supabaseAdmin
      .from("bring_claims")
      .select("id")
      .eq("item_id", vodkaItem!.id)
      .eq("rsvp_id", marcRsvp!.id)
      .maybeSingle();
    expect(claimAfter).toBeNull();

    const { data: chipsItemAfter } = await supabaseAdmin
      .from("bring_items")
      .select("id")
      .eq("event_id", event.id)
      .eq("label", "Chips")
      .maybeSingle();
    expect(chipsItemAfter).toBeNull();

    // L'hôte voit la jauge revenue à 0, plus aucune trace de Marc, et plus
    // de proposition "Chips" dans la modération.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await expect(page.getByText("0 L / 3 L")).toBeVisible();
    await expect(page.getByText("Marc", { exact: false })).not.toBeVisible();
    await expect(page.getByText("Chips", { exact: false })).not.toBeVisible();

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});
