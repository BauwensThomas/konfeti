// Petit script de démo (PAS un test) : ouvre un vrai navigateur, au ralenti,
// et parcourt le flux principal de l'app (connexion, création d'un
// événement, page événement) pour que Thomas puisse enregistrer son écran et
// obtenir une vidéo de démo pour la landing (brief 4.15). Crée un compte de
// démo jetable à chaque lancement (jamais de vraies données de Thomas).
//
// Usage : node --env-file=.env.local scripts/demo-walkthrough.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
// Timeout par défaut sur les actions Playwright : si un sélecteur ne trouve
// rien, le script échoue au bout de ce délai au lieu de rester bloqué à
// l'infini. Ajuste si besoin (en ms).
const DEFAULT_TIMEOUT = 8000;
const BIRTH_DATE = "1995-06-15";
const EVENT_DATE = "2026-12-24";

function computeAge(birthDateStr, eventDateStr) {
  const birth = new Date(birthDateStr);
  const event = new Date(eventDateStr);
  let age = event.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    event.getMonth() > birth.getMonth() ||
    (event.getMonth() === birth.getMonth() && event.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

async function loginAs(page, email) {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw linkError;

  const { data: sessionData, error: verifyError } = await supabaseAnon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (verifyError) throw verifyError;

  const url = new URL("/auth/test-login", BASE_URL);
  url.searchParams.set("access_token", sessionData.session.access_token);
  url.searchParams.set("refresh_token", sessionData.session.refresh_token);
  url.searchParams.set("next", "/mes-evenements");
  await page.goto(url.toString());
  return sessionData.session.user;
}

function pause(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function say(message) {
  console.log(`\n🎬 ${message}`);
}

// Essaie une série de stratégies de sélection dans l'ordre, s'arrête à la
// première qui trouve un élément visible. Si aucune ne marche, log un
// avertissement clair + screenshot de debug au lieu de bloquer le script.
async function tryFill(page, label, value, { strategies, screenshotName }) {
  for (const build of strategies) {
    const locator = build(page);
    try {
      if (await locator.isVisible({ timeout: 1500 })) {
        await locator.fill(value);
        return true;
      }
    } catch {
      // stratégie suivante
    }
  }
  console.warn(`⚠️ Champ "${label}" introuvable, étape ignorée (voir debug-${screenshotName}.png)`);
  await page.screenshot({ path: `debug-${screenshotName}.png`, fullPage: true }).catch(() => {});
  return false;
}

async function run() {
  // Viewport simple et beau pour l'enregistrement
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    slowMo: 300,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);
  let userId = null;

  try {
    say("✉️ Connexion...");
    const email = `demo-konfeti-${Date.now()}@example.com`;
    const user = await loginAs(page, email);
    userId = user.id;
    await pause(1);

    if (page.url().includes("/profil/completer")) {
      say("👤 Profil...");
      await page.getByLabel("Ton numéro de téléphone").fill("+32 470 00 00 00");
      await pause(0.5);
      await page.getByLabel("Une femme").check();
      await pause(0.5);
      await page.getByRole("button", { name: "Continuer" }).click();
      await pause(1.5);
    }

    say("🎨 Ouverture du wizard...");
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await pause(1.5);

    say("📝 ÉTAPE 1 - Infos principales");

    // Titre
    await page.getByPlaceholder("L'anniversaire de Julie").fill("L'anniversaire de Julie");
    await pause(0.6);

    // Photo
    say("  🖼️ Photo");
    await page.locator('input[type="file"]').setInputFiles(path.join(process.cwd(), "public", "mascot.webp"));
    await pause(2);

    // Thème
    say("  🎪 Thème Tropical");
    await page.evaluate(() => window.scrollBy(0, 150));
    await pause(0.5);
    const themeButtons = page.locator("button").filter({ has: page.locator("text=/Tropical/") });
    await themeButtons.first().click();
    await pause(1);

    // Date/lieu
    say("  📅 Date et lieu");
    await page.evaluate(() => window.scrollBy(0, 150));
    await pause(0.5);
    await page.locator('input[type="datetime-local"]').first().fill(`${EVENT_DATE}T20:00`);
    await pause(0.6);
    await page.locator('input[type="datetime-local"]').nth(1).fill(`${EVENT_DATE}T23:30`);
    await pause(0.6);
    await page.getByPlaceholder("Adresse et ville").fill("Rue de la Fête 1, 1000 Bruxelles");
    await pause(1);

    // Afficher le résumé de l'étape 1
    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(1.5);

    say("➡️ Étape 2...");
    await page.getByRole("button", { name: "Suivant" }).click();
    await pause(1.5);

    say("🎂 ÉTAPE 2 - Occasion & description");

    // Occasion (birthday)
    const occasionSelect = page.locator("select").first();
    const currentValue = await occasionSelect.inputValue();
    if (!currentValue.includes("birthday")) {
      await occasionSelect.selectOption("birthday");
      await pause(0.8);
    }

    // Prénom de la personne fêtée
    // ⚠️ FIX : l'ancien code utilisait getByLabel("Ton numéro") ici (copié-collé
    // de l'étape 1), ce qui ne correspond à aucun champ de cette page et
    // bloquait le script indéfiniment. En attendant confirmation du vrai
    // label/placeholder, on tente plusieurs stratégies sans jamais bloquer.
    say("  👧 Infos anniversaire");
    await tryFill(page, "Prénom de la personne", "Julie", {
      screenshotName: "etape2-prenom",
      strategies: [
        (p) => p.getByLabel("Prénom", { exact: false }),
        (p) => p.getByPlaceholder("Julie"),
        (p) => p.locator("input[type='text']").first(),
      ],
    });
    await pause(0.5);

    await tryFill(page, "Date de naissance", BIRTH_DATE, {
      screenshotName: "etape2-date-naissance",
      strategies: [
        (p) => p.getByLabel("Date de naissance", { exact: false }),
        (p) => p.getByLabel("Née le", { exact: false }),
        (p) => p.locator("input[type='date']").first(),
      ],
    });
    await pause(1);
    const julieAge = computeAge(BIRTH_DATE, EVENT_DATE);

    // Show age checkbox
    const showAgeCheckbox = page.locator("input[type='checkbox']").first();
    if (await showAgeCheckbox.isVisible()) {
      const isChecked = await showAgeCheckbox.isChecked();
      if (!isChecked) {
        await showAgeCheckbox.check();
        await pause(0.5);
      }
    }

    // Description
    say("  ✏️ Description");
    await page.evaluate(() => window.scrollBy(0, 200));
    await pause(0.5);
    const descriptionField = page.locator("textarea").first();
    if (await descriptionField.isVisible()) {
      await descriptionField.fill(`Venez célébrer les ${julieAge} ans de Julie ! Une soirée tropicale avec punch, jeux et bonne ambiance. On adore Julie et c'est l'occasion parfaite pour se retrouver tous ensemble !`);
      await pause(1);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(1);

    say("➡️ Étape 3...");
    await page.getByRole("button", { name: "Suivant" }).click();
    await pause(1.5);

    say("🎩 ÉTAPE 3 - Consignes & paramètres");

    // Instructions
    say("  📋 Instructions");
    const instructionsField = page.locator("textarea").first();
    if (await instructionsField.isVisible()) {
      await instructionsField.fill("Arrivée 20h00 - Cadeaux non obligatoires mais appréciés ! 🎁\nParking disponible rue de la Fête.\nMerci de confirmer ta présence avant le 20 décembre.");
      await pause(0.8);
    }

    // Dress code
    say("  👗 Dress code");
    await page.evaluate(() => window.scrollBy(0, 100));
    await pause(0.5);
    const dressCodeField = page.locator("input[type='text']").first();
    if (await dressCodeField.isVisible()) {
      await dressCodeField.fill("Tenue tropicale - couleurs vives, fleurs, feuillage");
      await pause(0.8);
    }

    // Bring
    say("  🎁 À apporter");
    const bringField = page.locator("input[type='text']").nth(1);
    if (await bringField.isVisible()) {
      await bringField.fill("Un plat ou une boisson à partager");
      await pause(0.8);
    }

    // RSVP deadline
    say("  📆 RSVP deadline");
    await page.evaluate(() => window.scrollBy(0, 100));
    await pause(0.5);
    const rsvpField = page.locator("input[type='date']").first();
    if (await rsvpField.isVisible()) {
      const rsvpDate = new Date(EVENT_DATE);
      rsvpDate.setDate(rsvpDate.getDate() - 4);
      await rsvpField.fill(rsvpDate.toISOString().slice(0, 10));
      await pause(0.8);
    }

    // Kids allowed
    say("  👶 Enfants");
    const kidsSelect = page.locator("select").nth(1);
    if (await kidsSelect.isVisible()) {
      await kidsSelect.selectOption("yes");
      await pause(0.6);
    }

    // Pets allowed
    say("  🐕 Animaux");
    const petsSelect = page.locator("select").nth(2);
    if (await petsSelect.isVisible()) {
      await petsSelect.selectOption("yes");
      await pause(0.6);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(1);

    say("➡️ Étape 4...");
    await page.getByRole("button", { name: "Suivant" }).click();
    await pause(1.5);

    say("⚙️ ÉTAPE 4 - Paramètres finaux");

    // Max guests
    say("  👥 Max invités");
    const maxGuestsField = page.locator("input[type='number']").first();
    if (await maxGuestsField.isVisible()) {
      await maxGuestsField.fill("40");
      await pause(0.6);
    }

    // Allow companions
    say("  💑 Accompagnants");
    await page.evaluate(() => window.scrollBy(0, 100));
    await pause(0.5);
    let checkboxes = await page.locator("input[type='checkbox']").all();
    if (checkboxes.length > 0 && !(await checkboxes[0].isChecked())) {
      await checkboxes[0].check();
      await pause(0.5);
    }

    // Auto approve
    say("  ✅ Auto-approbation");
    checkboxes = await page.locator("input[type='checkbox']").all();
    if (checkboxes.length > 1 && !(await checkboxes[1].isChecked())) {
      await checkboxes[1].check();
      await pause(0.5);
    }

    // Share policy (pas de changement, laisser "all")
    say("  🔗 Partage: public");

    // Pot enabled
    say("  💰 Activer la cagnotte");
    checkboxes = await page.locator("input[type='checkbox']").all();
    if (checkboxes.length > 2 && !(await checkboxes[2].isChecked())) {
      await checkboxes[2].check();
      await pause(1);

      // Pot mode
      say("  🎯 Mode: objectif");
      const potModeButton = page.locator("button").filter({ has: page.locator("text=/Objectif/") });
      if (await potModeButton.isVisible()) {
        await potModeButton.first().click();
        await pause(0.6);
      }

      // Pot goal
      say("  💵 Montant: 150€");
      const potGoalField = page.locator("input[type='number']").nth(1);
      if (await potGoalField.isVisible()) {
        await potGoalField.fill("150");
        await pause(0.6);
      }

      // Pot label
      say("  🏷️ Label cagnotte");
      const potLabelField = page.locator("input[type='text']").nth(2);
      if (await potLabelField.isVisible()) {
        await potLabelField.fill("Voyage surprise");
        await pause(0.8);
      }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(1.5);

    say("🎉 Création de l'événement...");
    const urlBeforeCreate = page.url();
    await page.getByRole("button", { name: "Créer l'événement" }).click();

    try {
      await page.waitForURL((url) => url.toString() !== urlBeforeCreate, { timeout: 15000 });
    } catch {
      console.warn("⚠️ Pas de changement d'URL détecté après 15s, on continue quand même");
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    say(`  📍 URL actuelle : ${page.url()}`);
    await pause(1);

    say("🖱️ Ouverture de l'événement depuis la liste...");
    await page.getByText("L'anniversaire de Julie").first().click();
    await page.waitForLoadState("networkidle").catch(() => {});
    say(`  📍 URL événement : ${page.url()}`);
    await pause(1);

    say("📊 Page événement - Aperçu complet");
    await page.screenshot({ path: "debug-page-evenement.png", fullPage: false }).catch(() => {});
    await pause(1);

    // Scroll pour montrer l'événement au complet
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 300));
      await pause(1.2);
    }

    say("👀 Retour en haut");
    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(2);

    say("✨ Démo complète ! Ferme la fenêtre (Ctrl+C) quand tu as fini.");
    await new Promise(() => {}); // ne ferme jamais tout seul
  } catch (err) {
    console.error("❌ Erreur pendant la démo, screenshot dans debug-crash.png");
    await page.screenshot({ path: "debug-crash.png", fullPage: true }).catch(() => {});
    throw err;
  } finally {
    if (userId) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
