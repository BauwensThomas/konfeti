import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test("sondage defini au wizard, vote multiple, proposition d'un invite moderee (approbation et refus)", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const hostEmail = `e2e-polls-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete sondages ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 5, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 4 : un sondage défini par l'organisateur (comportement
    // historique, `status` = 'approved' d'office), 3 options (une de plus
    // que le minimum de 2, pour vérifier le bouton "Ajouter une option").
    await page.getByRole("button", { name: "Ajouter un sondage" }).click();
    await page.getByLabel("Question du sondage 1").fill("Quelle activité ?");
    await page.getByLabel("Option 1 du sondage 1").fill("Pétanque");
    await page.getByLabel("Option 2 du sondage 1").fill("Piscine");
    await page.getByRole("button", { name: "Ajouter une option" }).click();
    await page.getByLabel("Option 3 du sondage 1").fill("Barbecue");

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

    // Marc rejoint et est approuvé comme invité normal.
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Continuer sans compte" }).click();
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000092");
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

    // Marc vote pour PLUSIEURS options du même sondage (confirmé avec
    // Thomas : vote multiple, pas un choix unique).
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await expect(marcPage.getByText("Quelle activité ?")).toBeVisible();
    await marcPage.getByRole("listitem").filter({ hasText: "Pétanque" }).getByRole("checkbox").check();
    await marcPage.getByRole("listitem").filter({ hasText: "Piscine" }).getByRole("checkbox").check();
    await expect(marcPage.getByRole("listitem").filter({ hasText: "Pétanque" })).toContainText("1 vote", {
      timeout: 15_000,
    });
    await expect(marcPage.getByRole("listitem").filter({ hasText: "Piscine" })).toContainText("1 vote");
    await expect(marcPage.getByRole("listitem").filter({ hasText: "Barbecue" })).toContainText("Aucun vote");

    // Marc propose un nouveau sondage -- en attente, jamais renvoyé par RLS
    // ailleurs qu'à un admin (même principe que "qui apporte quoi"). Le
    // formulaire est désormais dans un popup (retour Thomas : trop de place
    // prise sur mobile), ouvert via son bouton déclencheur.
    await marcPage.getByRole("button", { name: "Proposer un sondage" }).click();
    await marcPage.getByPlaceholder("Ex. Quelle activité pour l'apéro ?").fill("Quel dessert ?");
    await marcPage.getByLabel("Option 1").fill("Tarte");
    await marcPage.getByLabel("Option 2").fill("Glace");
    await marcPage.getByRole("button", { name: "Proposer", exact: true }).click();
    const proposeSuccess = marcPage.getByText("Merci ! Ta proposition attend la validation de l'organisateur.");
    await expect(proposeSuccess).toBeVisible({ timeout: 15_000 });
    await expect(marcPage.getByText("Quel dessert ?")).not.toBeVisible();

    // L'hôte modère : voit la section "en attente", le nom du proposant, et
    // approuve -- le sondage devient votable pour tout le monde.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await expect(page.getByText("En attente d'approbation")).toBeVisible();
    await expect(page.getByText("Quel dessert ?")).toBeVisible();
    await expect(page.getByText("Proposé par Marc Untel")).toBeVisible();
    await page.getByRole("button", { name: "Approuver" }).click();
    // "Quel dessert ?" est déjà visible AVANT ce clic (section "en attente") :
    // attendre à nouveau ce même texte ne prouverait rien (satisfait
    // instantanément par l'ancien affichage, sans attendre le vrai
    // aller-retour serveur). On attend la disparition de la section
    // "en attente" elle-même, seul signal fiable que l'approbation a bien
    // été prise en compte.
    await expect(page.getByText("En attente d'approbation")).not.toBeVisible({ timeout: 15_000 });

    const { data: dessertPoll } = await supabaseAdmin
      .from("polls")
      .select("id, status")
      .eq("event_id", event.id)
      .eq("question", "Quel dessert ?")
      .single();
    expect(dessertPoll!.status).toBe("approved");

    // Marc propose un dernier sondage, refusé cette fois : suppression
    // définitive, jamais renvoyé à personne.
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await marcPage.getByRole("button", { name: "Proposer un sondage" }).click();
    await marcPage.getByPlaceholder("Ex. Quelle activité pour l'apéro ?").fill("Quelle musique ?");
    await marcPage.getByLabel("Option 1").fill("Rock");
    await marcPage.getByLabel("Option 2").fill("Pop");
    await marcPage.getByRole("button", { name: "Proposer", exact: true }).click();
    await expect(proposeSuccess).toBeVisible({ timeout: 15_000 });

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await expect(page.getByText("Quelle musique ?")).toBeVisible();
    await page.getByRole("button", { name: "Refuser" }).click();
    await expect(page.getByText("Quelle musique ?")).not.toBeVisible({ timeout: 15_000 });

    const { data: musicPollAfterReject } = await supabaseAdmin
      .from("polls")
      .select("id")
      .eq("event_id", event.id)
      .eq("question", "Quelle musique ?")
      .maybeSingle();
    expect(musicPollAfterReject).toBeNull();

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});

// Retour Thomas : "le vote doit disparaitre si la personne part ou faire
// disparaitre la demande en cours si l'utilisateur part avant que ce soit
// active" -- confirmé étendu au chemin "Je ne peux pas" aussi (pas
// seulement quitter/être retiré), même règle que le correctif "qui apporte
// quoi" du même jour (migration 20260710002600).
test("dire 'je ne peux pas' retire automatiquement le vote et la proposition de sondage en attente", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const hostEmail = `e2e-polls-restricted-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete sondage restreint ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 6, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Ajouter un sondage" }).click();
    await page.getByLabel("Question du sondage 1").fill("Quel jour ?");
    await page.getByLabel("Option 1 du sondage 1").fill("Samedi");
    await page.getByLabel("Option 2 du sondage 1").fill("Dimanche");

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
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000091");
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

    // Marc vote, ET propose un second sondage encore en attente.
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await marcPage.getByRole("listitem").filter({ hasText: "Samedi" }).getByRole("checkbox").check();
    await expect(marcPage.getByRole("listitem").filter({ hasText: "Samedi" })).toContainText("1 vote", {
      timeout: 15_000,
    });

    await marcPage.getByRole("button", { name: "Proposer un sondage" }).click();
    await marcPage.getByPlaceholder("Ex. Quelle activité pour l'apéro ?").fill("Quel lieu ?");
    await marcPage.getByLabel("Option 1").fill("Jardin");
    await marcPage.getByLabel("Option 2").fill("Salle");
    await marcPage.getByRole("button", { name: "Proposer", exact: true }).click();
    await expect(
      marcPage.getByText("Merci ! Ta proposition attend la validation de l'organisateur."),
    ).toBeVisible({ timeout: 15_000 });

    // Toujours filtré par `event_id` (via `polls`), jamais juste par
    // libellé seul : "Samedi" n'est pas garanti unique dans toute la base
    // partagée entre sessions de test (bug réel trouvé -- des événements
    // orphelins d'anciens runs interrompus faisaient échouer `.single()`
    // avec plusieurs lignes "Samedi" au global).
    const { data: quelJourPoll } = await supabaseAdmin
      .from("polls")
      .select("id")
      .eq("event_id", event.id)
      .eq("question", "Quel jour ?")
      .single();
    const { data: samediOption } = await supabaseAdmin
      .from("poll_options")
      .select("id")
      .eq("poll_id", quelJourPoll!.id)
      .eq("label", "Samedi")
      .single();
    const { data: voteBefore } = await supabaseAdmin
      .from("poll_votes")
      .select("id")
      .eq("option_id", samediOption!.id)
      .eq("rsvp_id", marcRsvp!.id)
      .maybeSingle();
    expect(voteBefore).not.toBeNull();

    const { data: lieuPollBefore } = await supabaseAdmin
      .from("polls")
      .select("id")
      .eq("event_id", event.id)
      .eq("question", "Quel lieu ?")
      .maybeSingle();
    expect(lieuPollBefore).not.toBeNull();

    // Marc change sa réponse : "Je ne peux pas".
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Je ne peux pas" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("restricted");

    const { data: voteAfter } = await supabaseAdmin
      .from("poll_votes")
      .select("id")
      .eq("option_id", samediOption!.id)
      .eq("rsvp_id", marcRsvp!.id)
      .maybeSingle();
    expect(voteAfter).toBeNull();

    const { data: lieuPollAfter } = await supabaseAdmin
      .from("polls")
      .select("id")
      .eq("event_id", event.id)
      .eq("question", "Quel lieu ?")
      .maybeSingle();
    expect(lieuPollAfter).toBeNull();

    // L'hôte voit le compteur revenu à zéro, plus de proposition "Quel lieu ?".
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Samedi" })).toContainText("Aucun vote");
    await expect(page.getByText("Quel lieu ?")).not.toBeVisible();

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});
