import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Bug réel rencontré (pas un flake de charge, contrairement à ce qu'on
// pensait au départ) : un numéro codé en dur, réutilisé par des dizaines
// d'exécutions de ce fichier au fil d'une longue session, finit par entrer
// en collision avec un profil de test déjà créé (souvent orphelin, un run
// interrompu n'a pas toujours le temps de nettoyer) -- le formulaire "encore
// une petite étape" reste bloqué en "Un instant..." sans jamais rediriger.
// Un numéro unique par exécution, comme l'email juste en dessous, élimine le
// problème à la racine plutôt que d'espérer qu'aucun run précédent n'ait pris
// ce numéro.
const uniquePhone = () => `+3247${Date.now().toString().slice(-7)}`;

test("un organisateur modifie puis supprime son evenement", async ({ page }) => {
  const email = `e2e-organisateur-${Date.now()}@example.com`;
  const user = await loginAs(page, email);

  try {
    await page.goto("/profil/completer");
    await page.getByPlaceholder("Julie").fill("Hôte");
    await page.getByPlaceholder("Dean").fill("Test");
    await page.getByLabel("Ton numéro de téléphone").fill(uniquePhone());
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    await page.getByRole("link", { name: "Créer un événement" }).click();
    const title = `Fete a modifier ${Date.now()}`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    // Depuis la page événement, aller sur "Modifier"
    await page.getByText(title).click();
    await expect(page).toHaveURL(/\/e\/.+/);
    await page.getByRole("link", { name: "Modifier", exact: true }).click();
    await expect(page).toHaveURL(/\/modifier$/);

    // Le formulaire est bien pré-rempli avec les valeurs existantes
    await expect(page.getByPlaceholder("L'anniversaire de Julie")).toHaveValue(title);

    const newTitle = `${title} modifie`;
    await page.getByPlaceholder("L'anniversaire de Julie").fill(newTitle);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();

    // Retour sur la page événement, avec le nouveau titre
    await expect(page).toHaveURL(/\/e\/.+/);
    await expect(page).not.toHaveURL(/\/modifier$/);
    await expect(page.getByRole("heading", { name: newTitle })).toBeVisible();

    const { data: eventAfterEdit } = await supabaseAdmin
      .from("events")
      .select("id, title")
      .eq("title", newTitle)
      .maybeSingle();
    expect(eventAfterEdit?.title).toBe(newTitle);

    // Suppression (annulation), avec confirmation
    await page.getByRole("button", { name: "Supprimer l'événement" }).click();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);
    await expect(page.getByText(newTitle)).not.toBeVisible();

    const { data: eventAfterDelete } = await supabaseAdmin
      .from("events")
      .select("status")
      .eq("id", eventAfterEdit!.id)
      .maybeSingle();
    expect(eventAfterDelete?.status).toBe("cancelled");

    await supabaseAdmin.from("events").delete().eq("id", eventAfterEdit!.id);
  } finally {
    await deleteTestUser(user.id);
  }
});

// Retour Thomas : "dans modifier, à côté de suivant et enregistrer, je veux
// une croix dans une bulle rouge et ça ramène à l'accueil" -- quitter le
// wizard sans enregistrer, uniquement en édition (une croix qui ramènerait à
// "l'accueil" n'aurait pas de sens en création, l'événement n'existe pas
// encore).
test("la croix du wizard Modifier annule et revient à l'événement sans enregistrer", async ({
  page,
}) => {
  const email = `e2e-cancel-wizard-${Date.now()}@example.com`;
  const user = await loginAs(page, email);

  try {
    await page.goto("/profil/completer");
    await page.getByPlaceholder("Julie").fill("Hôte");
    await page.getByPlaceholder("Dean").fill("Test");
    await page.getByLabel("Ton numéro de téléphone").fill(uniquePhone());
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const title = `Fete annulation wizard ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    // Jamais affichée en création : quitter n'aurait nulle part de sensé où
    // aller tant que l'événement n'existe pas encore.
    await expect(
      page.getByRole("link", { name: "Annuler et revenir à l'événement" }),
    ).not.toBeVisible();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 5, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    await page.getByText(title).click();
    await expect(page).toHaveURL(/\/e\/.+/);
    await page.getByRole("link", { name: "Modifier", exact: true }).click();
    await expect(page).toHaveURL(/\/modifier$/);

    await page.getByPlaceholder("L'anniversaire de Julie").fill(`${title} jamais enregistre`);
    await page.getByRole("link", { name: "Annuler et revenir à l'événement" }).click();

    await expect(page).toHaveURL(new RegExp(`/e/.+`));
    await expect(page).not.toHaveURL(/\/modifier$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const { data: eventUnchanged } = await supabaseAdmin
      .from("events")
      .select("id, title")
      .eq("title", title)
      .maybeSingle();
    expect(eventUnchanged?.title).toBe(title);

    await supabaseAdmin.from("events").delete().eq("id", eventUnchanged!.id);
  } finally {
    await deleteTestUser(user.id);
  }
});

// Retour Thomas : "j'ai réussi à créer un événement à une date inférieure à
// aujourd'hui, et à mettre la date limite aussi avant la date actuelle...
// ça ne doit pas être possible". Deux bugs réels distincts trouvés :
// 1. `updateEventSchema` sautait la contrainte "pas de date passée" pour
//    TOUTE édition (pensée pour corriger un événement déjà terminé), ce qui
//    permettait aussi de faire reculer un événement encore à venir.
// 2. La date limite de réponse n'était comparée qu'à la date de l'événement
//    (jamais après), jamais à "maintenant" -- une date limite passée
//    passait donc si elle restait avant l'événement (même passé).
test("impossible de faire reculer un événement à venir vers le passé, ou de mettre une date limite passée", async ({
  page,
}) => {
  const email = `e2e-past-date-${Date.now()}@example.com`;
  const user = await loginAs(page, email);

  try {
    await page.goto("/profil/completer");
    await page.getByPlaceholder("Julie").fill("Hôte");
    await page.getByPlaceholder("Dean").fill("Test");
    await page.getByLabel("Ton numéro de téléphone").fill(uniquePhone());
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const title = `Fete date passee ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 6, 1000 Bruxelles");
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

    // Tentative de reculer la date (encore à venir) vers le passé : bloqué.
    await page.goto(`/e/${event.short_code}/modifier`);
    // Flake intermittent identifié (pas juste "sous forte charge") : le TOUT
    // PREMIER `.fill()` sur ce champ contrôlé après le chargement de page
    // peut ne pas être capté par React (l'état interne de "value tracking"
    // que React patche sur l'input n'est pas encore prêt), même après avoir
    // confirmé que la valeur pré-remplie est bien affichée -- la valeur DOM
    // change visuellement mais `data.startsAt` (et donc la validation) reste
    // sur l'ancienne valeur. Un remplissage "à blanc" (même valeur qu'avant)
    // avant le vrai remplissage force cette initialisation de façon fiable
    // (vérifié : échoue de façon reproductible sans cette étape, passe à
    // chaque fois avec).
    const startsAtInput = page.locator('input[type="datetime-local"]').first();
    await expect(startsAtInput).toHaveValue("2026-12-24T20:00");
    await startsAtInput.fill("2026-12-24T20:00");
    await startsAtInput.fill("2020-01-01T20:00");
    await expect(page.getByText("Cette date ne peut pas être dans le passé.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Suivant" })).toBeDisabled();

    // Remet une date future valide, avance jusqu'à la date limite de réponse.
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.locator('input[type="date"]').fill("2020-01-01");
    await expect(page.getByText("Cette date ne peut pas être dans le passé.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Suivant" })).toBeDisabled();

    const { data: eventUnchanged } = await supabaseAdmin
      .from("events")
      .select("starts_at, rsvp_deadline")
      .eq("id", event.id)
      .single();
    expect(new Date(eventUnchanged!.starts_at!).getUTCFullYear()).toBe(2026);
    expect(eventUnchanged?.rsvp_deadline).toBeNull();

    await supabaseAdmin.from("events").delete().eq("id", event.id);
  } finally {
    await deleteTestUser(user.id);
  }
});

// Bug réel signalé par Thomas : "si je créé un événement anniversaire, je
// rentre les infos de l'anniversaire, l'âge etc.. mais après j'ai modifié en
// nouvelle année, sur la page d'accueil on voit toujours Julie 39 ans." Le
// wizard ne réinitialise jamais les champs propres à une occasion quand elle
// change (juste masqués côté UI) -- corrigé à la source (`eventRowFromInput`).
test("changer l'occasion d'un événement efface les infos de l'ancienne occasion", async ({ page }) => {
  const email = `e2e-occasion-switch-${Date.now()}@example.com`;
  const user = await loginAs(page, email);

  try {
    await page.goto("/profil/completer");
    await page.getByPlaceholder("Julie").fill("Hôte");
    await page.getByPlaceholder("Dean").fill("Test");
    await page.getByLabel("Ton numéro de téléphone").fill(uniquePhone());
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const title = `Fete occasion ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 1, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();

    // Étape 2 : occasion "Anniversaire" (popup, plus un <select> natif depuis
    // la généralisation du pattern bouton+Modal à tout le wizard), nom rempli.
    await page.getByRole("button", { name: "Autre", exact: true }).click();
    await page.getByRole("button", { name: "Anniversaire", exact: true }).click();
    await page.locator("input[type='text']").first().fill("Julie");
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

    await page.goto(`/e/${event.short_code}`);
    // Phrase contextuelle (pas juste le prénom brut) depuis le redesign de
    // l'Accueil -- voir ARCHITECTURE.md, "C'est l'anniversaire de {person}...".
    await expect(page.getByText("C'est l'anniversaire de Julie !")).toBeVisible();

    // Modifie l'occasion vers "Nouvel An".
    await page.goto(`/e/${event.short_code}/modifier`);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Anniversaire", exact: true }).click();
    await page.getByRole("button", { name: "Nouvel An", exact: true }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${event.short_code}$`));

    // La phrase d'anniversaire ne doit plus apparaître nulle part sur l'Accueil.
    await expect(page.getByText("C'est l'anniversaire de Julie !")).not.toBeVisible();

    const { data: eventAfter } = await supabaseAdmin
      .from("events")
      .select("birthday_person, occasion")
      .eq("id", event.id)
      .single();
    expect(eventAfter?.occasion).toBe("new_year");
    expect(eventAfter?.birthday_person).toBeNull();

    await supabaseAdmin.from("events").delete().eq("id", event.id);
  } finally {
    await deleteTestUser(user.id);
  }
});

// Bug réel signalé par Thomas : "j'essaie de modifier l'événement, à +1
// minute que l'heure actuelle et ça me met d'office 2h plus tard". La valeur
// brute de l'input datetime-local (heure locale, sans fuseau) partait telle
// quelle vers Postgres, qui la réinterprétait dans le fuseau de sa session
// (UTC) au lieu du fuseau du navigateur -- décalage égal à l'écart
// CEST/UTC (2h en été). Corrigé via `fromLocalDateTimeValue` (voir
// `src/lib/datetime.ts`) : ce test vérifie que l'heure locale ressaisie dans
// le formulaire de modification ressort identique une fois relue en base.
test("modifier la date d'un événement conserve l'heure locale exacte (pas de décalage de fuseau)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = `e2e-date-tz-${Date.now()}@example.com`;
  const user = await loginAs(page, email);

  try {
    await page.goto("/profil/completer");
    await page.getByPlaceholder("Julie").fill("Hôte");
    await page.getByPlaceholder("Dean").fill("Test");
    await page.getByLabel("Ton numéro de téléphone").fill(uniquePhone());
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const title = `Fete fuseau ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 11, 1000 Bruxelles");
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

    // Rescédule à un horaire précis, comme Thomas ("+1 minute que l'heure
    // actuelle") -- ici une valeur fixe et déterministe équivalente.
    const newValue = "2027-03-15T14:31";
    await page.goto(`/e/${event.short_code}/modifier`);
    // Le TOUT PREMIER `.fill()` sur ce champ contrôlé après le chargement de
    // page peut ne pas être capté par React (voir le commentaire détaillé
    // plus haut, même bug) -- un remplissage "à blanc" avant le vrai
    // remplissage force l'initialisation de façon fiable.
    const startsAtInput = page.locator('input[type="datetime-local"]').first();
    await expect(startsAtInput).toHaveValue("2026-12-24T20:00");
    await startsAtInput.fill("2026-12-24T20:00");
    await startsAtInput.fill(newValue);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${event.short_code}$`));

    const { data: eventAfter } = await supabaseAdmin
      .from("events")
      .select("starts_at")
      .eq("id", event.id)
      .single();

    // Reconstruit la même valeur "YYYY-MM-DDTHH:mm" en heure locale que
    // `toLocalDateTimeValue` (le pré-remplissage du formulaire) : doit
    // retomber exactement sur ce qui a été saisi, pas décalé de 2h.
    const stored = new Date(eventAfter!.starts_at!);
    const pad = (n: number) => String(n).padStart(2, "0");
    const roundTripped = `${stored.getFullYear()}-${pad(stored.getMonth() + 1)}-${pad(stored.getDate())}T${pad(stored.getHours())}:${pad(stored.getMinutes())}`;
    expect(roundTripped).toBe(newValue);

    await supabaseAdmin.from("events").delete().eq("id", event.id);
  } finally {
    await deleteTestUser(user.id);
  }
});
