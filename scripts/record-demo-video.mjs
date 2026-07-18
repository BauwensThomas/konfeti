// Enregistre 3 courtes vidéos (webm) d'un parcours de démo complet
// (création d'événement, chat, sondage, qui apporte quoi, cagnotte) pour en
// faire un montage réseaux sociaux -- contrairement à demo-walkthrough.mjs
// (pensé pour que Thomas filme SON écran pendant que le script joue), celui-ci
// enregistre directement via Playwright (`recordVideo`), aucune capture
// d'écran manuelle nécessaire. Comptes de démo jetables, supprimés à la fin.
//
// Usage : node --env-file=.env.local scripts/record-demo-video.mjs
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const VIEWPORT = { width: 390, height: 844 }; // format téléphone, cohérent avec le rendu vertical visé
const OUT_DIR = path.join(process.cwd(), "videos", "raw");

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function loginAs(page, email) {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
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
  await page.waitForLoadState("networkidle").catch(() => {});
  return sessionData.session.user;
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function say(msg) {
  console.log(`  ${msg}`);
}

function toLocalDateTimeValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function completeProfileIfNeeded(page, { phone, female }) {
  if (!page.url().includes("/profil/completer")) return;
  await page.getByLabel("Ton numéro de téléphone").fill(phone);
  await page.getByLabel(female ? "Une femme" : "Un homme").check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const eventDate = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  eventDate.setHours(20, 0, 0, 0);
  const eventTitle = "L'anniversaire de Julie";

  // Le flag `pot` est actuellement désactivé en prod (retour Thomas, en
  // attendant la confirmation MyTentoo/Stripe) -- réactivé le temps de
  // l'enregistrement pour montrer la cagnotte dans la démo, restauré à son
  // état d'origine (`finally`) quoi qu'il arrive, y compris en cas d'échec.
  const { data: potFlagBefore } = await supabaseAdmin.from("feature_flags").select("enabled").eq("key", "pot").single();
  const potWasEnabled = potFlagBefore?.enabled ?? false;
  if (!potWasEnabled) {
    await supabaseAdmin.from("feature_flags").update({ enabled: true, updated_at: new Date().toISOString() }).eq("key", "pot");
    console.log("Flag pot temporairement réactivé pour l'enregistrement (sera remis à l'état d'origine à la fin).");
  }

  let orgUserId = null;
  let guestUserId = null;
  let shortCode = null;

  try {
    // ============================================================
    // SCÈNE 1 : l'organisatrice crée l'événement
    // ============================================================
    console.log("SCÈNE 1 : création de l'événement");
    const orgContext = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: path.join(OUT_DIR, "1-creation"), size: VIEWPORT },
    });
    const org = await orgContext.newPage();
    org.setDefaultTimeout(10000);

    const orgEmail = `demo-org-${Date.now()}@example.com`;
    const orgUser = await loginAs(org, orgEmail);
    orgUserId = orgUser.id;
    await completeProfileIfNeeded(org, { phone: "+32 470 00 00 01", female: true });

    await org.goto(`${BASE_URL}/fr/creer`);
    await pause(600);

    say("Étape 1 : titre, thème, date, lieu");
    await org.getByPlaceholder("L'anniversaire de Julie").fill(eventTitle);
    await pause(500);
    await org.locator("button", { hasText: "Tropical" }).first().click();
    await pause(500);
    await org.locator('input[type="datetime-local"]').first().fill(toLocalDateTimeValue(eventDate));
    await pause(400);
    await org.getByPlaceholder("Adresse et ville").fill("Rue de la Fête 1, 1000 Bruxelles");
    await pause(1200);
    await org.keyboard.press("Escape");
    await pause(400);
    await org.getByRole("button", { name: "Suivant" }).click();
    await pause(600);

    say("Étape 2 : occasion + description");
    await org.getByRole("button", { name: "Autre" }).click();
    await pause(400);
    await org.getByRole("button", { name: "Anniversaire" }).click();
    await pause(400);
    // Champ prénom fêté(e) : premier input texte de l'étape, apparaît une
    // fois l'occasion "birthday" choisie (pas de placeholder fiable dessus).
    await org.locator("input[type='text']").first().fill("Julie");
    await pause(400);
    const birthDateInput = org.locator("input[type='date']").first();
    if (await birthDateInput.isVisible().catch(() => false)) {
      await birthDateInput.fill("1996-04-12");
    }
    await pause(400);
    await org.locator("textarea").first().fill("Une soirée tropicale pour fêter Julie comme il se doit : cocktails, musique et bonne humeur !");
    await pause(1000);
    await org.getByRole("button", { name: "Suivant" }).click();
    await pause(600);

    say("Étape 3 : consignes");
    await org.locator("textarea").first().fill("Merci de confirmer ta présence, et prévois une tenue légère !");
    await pause(800);
    await org.getByRole("button", { name: "Suivant" }).click();
    await pause(600);

    say("Étape 4 : approbation auto, cagnotte, qui apporte quoi, sondage");
    await org.getByText("Approbation automatique des invités").click();
    await pause(500);
    await org.getByText("Ajouter une cagnotte").click();
    await pause(600);
    const potGoalInput = org.locator("input[type='number']").nth(1);
    if (await potGoalInput.isVisible().catch(() => false)) await potGoalInput.fill("200");
    await pause(400);
    await org.getByPlaceholder("Cadeau collectif pour Julie").fill("Un beau cadeau pour Julie").catch(() => {});
    await pause(800);

    await org.getByText("Ajouter un produit").click();
    await pause(400);
    await org.getByPlaceholder("Ex. Bouteilles de soda, gâteau, glaçons...").fill("Boissons fraîches");
    await pause(500);
    const bringQtyInput = org.locator("input[type='number']").last();
    await bringQtyInput.fill("10");
    await pause(400);
    // Unité obligatoire (un item sans unité est silencieusement écarté à la
    // soumission, voir CreateEventWizard.tsx) : popup "Choisir..." -> "Pièce(s)".
    await org.getByText("Choisir...").click();
    await pause(400);
    await org.getByText("Pièce(s)").click();
    await pause(600);

    await org.getByText("Ajouter un sondage").click();
    await pause(400);
    await org.getByPlaceholder("Ex. Quelle activité pour l'apéro ?").fill("Quelle musique pour la soirée ?");
    await pause(400);
    const pollOptions = org.getByPlaceholder("Ex. Pétanque");
    await pollOptions.nth(0).fill("Reggaeton");
    await pause(300);
    await pollOptions.nth(1).fill("Pop");
    await pause(1200);

    await org.evaluate(() => window.scrollTo(0, 0));
    await pause(500);
    await org.getByRole("button", { name: "Suivant" }).click();
    await pause(800);

    say("Étape 5 : création");
    await org.getByRole("button", { name: "Créer l'événement" }).click();
    await org.waitForLoadState("networkidle").catch(() => {});
    await pause(800);

    await org.getByText(eventTitle).first().click();
    await org.waitForURL(/\/e\//, { timeout: 10000 }).catch(() => {});
    await org.waitForLoadState("networkidle").catch(() => {});
    await pause(1800);

    say(`URL actuelle : ${org.url()}`);
    shortCode = org.url().split("/e/")[1]?.split(/[/?]/)[0];
    say(`shortCode : ${shortCode}`);
    if (!shortCode) throw new Error(`shortCode introuvable dans l'URL : ${org.url()}`);

    // Vue d'ensemble Accueil
    for (let i = 0; i < 3; i++) {
      await org.evaluate(() => window.scrollBy(0, 300));
      await pause(700);
    }
    await org.evaluate(() => window.scrollTo(0, 0));
    await pause(1000);

    await orgContext.close();
    say("Vidéo 1 enregistrée.");

    // ============================================================
    // SCÈNE 2 : un invité rejoint et participe (chat, sondage, qui
    // apporte quoi, cagnotte)
    // ============================================================
    console.log("SCÈNE 2 : participation d'un invité");
    const guestContext = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: path.join(OUT_DIR, "2-participation"), size: VIEWPORT },
    });
    const guest = await guestContext.newPage();
    guest.setDefaultTimeout(10000);

    const guestEmail = `demo-guest-${Date.now()}@example.com`;
    const guestUser = await loginAs(guest, guestEmail);
    guestUserId = guestUser.id;
    await completeProfileIfNeeded(guest, { phone: "+32 470 00 00 02", female: false });

    await guest.goto(`${BASE_URL}/fr/e/${shortCode}`);
    await guest.waitForLoadState("networkidle").catch(() => {});
    await pause(800);

    say("Identité invité");
    await guest.getByLabel("Prénom").fill("Ben");
    await pause(300);
    await guest.getByLabel("Nom", { exact: true }).fill("Martin");
    await pause(300);
    await guest.getByLabel("Ton numéro de téléphone").fill("+32 470 00 00 02");
    await pause(300);
    await guest.getByLabel("Un homme").check();
    await pause(300);
    await guest.getByRole("button", { name: "Avatar 2" }).click();
    await pause(300);
    await guest.getByLabel("Je viens !").check();
    await pause(1000);
    await guest.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await guest.waitForLoadState("networkidle").catch(() => {});
    await pause(1500);

    say("Chat");
    await guest.getByRole("button", { name: "Chat" }).click();
    await pause(1000);
    await guest.locator("#chat-message-input").fill("Trop hâte, à très vite !");
    await pause(500);
    await guest.getByRole("button", { name: "Envoyer" }).click();
    await pause(1500);

    say("Sondage");
    await guest.getByRole("button", { name: "Participer" }).click();
    await pause(800);
    // La case à cocher d'une option (choix multiple) n'a pas de nom
    // accessible propre (label vide, voir PollsListClient.tsx) -- ciblée par
    // le `<li>` (display:contents) qui contient le libellé de l'option.
    await guest.locator("li", { hasText: "Reggaeton" }).locator("input[type='checkbox']").check();
    await pause(1500);

    say("Qui apporte quoi");
    await guest.getByRole("button", { name: "À apporter" }).click();
    await pause(800);
    await guest.getByRole("button", { name: "J'apporte" }).click();
    await pause(1500);

    say("Cagnotte (formulaire seulement, pas de vrai paiement)");
    await guest.getByRole("button", { name: "Cagnotte" }).click();
    await pause(800);
    const amountInput = guest.locator("input[type='number']").first();
    if (await amountInput.isVisible().catch(() => false)) {
      await amountInput.fill("20");
    }
    await pause(2000);

    await guestContext.close();
    say("Vidéo 2 enregistrée.");

    // ============================================================
    // SCÈNE 3 : l'organisatrice voit le chat vivant + Personnes
    // ============================================================
    console.log("SCÈNE 3 : retour organisatrice");
    const orgContext2 = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: path.join(OUT_DIR, "3-retour-organisatrice"), size: VIEWPORT },
    });
    const org2 = await orgContext2.newPage();
    org2.setDefaultTimeout(10000);
    await loginAs(org2, orgEmail);
    await org2.goto(`${BASE_URL}/fr/e/${shortCode}`);
    await org2.waitForLoadState("networkidle").catch(() => {});
    await pause(1000);

    await org2.getByRole("button", { name: "Chat" }).click();
    await pause(1200);
    await org2.locator("#chat-message-input").fill("Hâte de te voir Ben !");
    await pause(500);
    await org2.getByRole("button", { name: "Envoyer" }).click();
    await pause(1500);

    await org2.getByRole("button", { name: "Personnes" }).click();
    await pause(1800);

    await orgContext2.close();
    say("Vidéo 3 enregistrée.");
  } catch (err) {
    console.error("ÉCHEC :", err);
    throw err;
  } finally {
    if (orgUserId) await supabaseAdmin.auth.admin.deleteUser(orgUserId).catch(() => {});
    if (guestUserId) await supabaseAdmin.auth.admin.deleteUser(guestUserId).catch(() => {});
    if (!potWasEnabled) {
      await supabaseAdmin.from("feature_flags").update({ enabled: false, updated_at: new Date().toISOString() }).eq("key", "pot");
      console.log("Flag pot remis à l'état d'origine (désactivé).");
    }
    await browser.close();
  }

  console.log(`\nTerminé. Vidéos brutes dans ${OUT_DIR}`);
}

run().catch(() => process.exit(1));
