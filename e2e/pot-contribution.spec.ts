import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Cagnotte (Stripe Connect Express, brief 4.5/5.6). Comme pour les
// notifications push (voir push-notifications.spec.ts), le vrai paiement
// hébergé (Stripe Checkout) et le round-trip webhook ne se prêtent pas à un
// test Playwright classique (aucun Stripe CLI qui écoute pendant la suite
// e2e) -- tout le reste (actions serveur réelles, garde-fous d'autorisation,
// vrais appels à l'API Stripe pour créer un compte Connect/une session de
// paiement, écritures réelles en base) est testé pour de vrai. Seul l'effet
// du webhook `account.updated` (statut d'onboarding terminé) est simulé via
// service_role, exactement ce que ce webhook aurait écrit.

async function createTestEvent(page: import("@playwright/test").Page, title: string) {
  await page.getByRole("link", { name: "Créer un événement" }).click();
  await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
  await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
  await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 5, 1000 Bruxelles");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Créer l'événement" }).click();
  await expect(page).toHaveURL(/\/mes-evenements$/);

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, short_code, pot_owner")
    .eq("title", title)
    .maybeSingle();
  if (!event) throw new Error("evenement introuvable");
  return event;
}

async function submitGuestIdentity(
  page: import("@playwright/test").Page,
  firstName: string,
  phone: string,
  answerLabel: "Je viens !" | "Peut-être" | "Je ne peux pas",
) {
  await page.getByPlaceholder("Julie").fill(firstName);
  await page.getByPlaceholder("Dean").fill("Untel");
  await page.getByPlaceholder("+32 470 00 00 00").fill(phone);
  await page.getByLabel("Un homme").check();
  await page.getByRole("button", { name: "Avatar 1" }).click();
  await page.getByLabel(answerLabel).check();
  await page.getByRole("button", { name: "Envoyer ma réponse" }).click();
}

test("le detail des frais est affiche en toute transparence avant de contribuer", async ({ page }) => {
  const hostEmail = `e2e-pot-fees-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    await supabaseAdmin.from("feature_flags").update({ enabled: true }).eq("key", "pot");

    const title = `Fete cagnotte frais ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;
    await supabaseAdmin
      .from("events")
      .update({ pot_enabled: true, pot_mode: "open", pot_label: "Cadeau collectif" })
      .eq("id", event.id);

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Participer" }).click();
    await page.getByRole("button", { name: "Cagnotte" }).click();

    const amountInput = page.getByLabel("Montant que tu veux voir arriver dans la cagnotte (net)");
    await amountInput.fill("10");

    // Valeurs vérifiées par `pot-fees.test.ts` pour un net de 10€ : le
    // plancher de commission (65 centimes) s'active à ce montant, brut =
    // 11.07€ (frais Stripe + commission = 1.07€), net inchangé = 10.00€.
    await expect(page.getByText("Tu payes")).toBeVisible();
    await expect(page.getByText("11.07€")).toBeVisible();
    await expect(page.getByText("Arrive dans la cagnotte")).toBeVisible();
    await expect(page.getByText("10.00€")).toBeVisible();
    await expect(page.getByText("1.07€", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Les contributions sont définitives, elles ne sont jamais remboursées."),
    ).toBeVisible();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
  }
});

test("impossible de contribuer sans autorisation reelle (restricted sans acces accorde, ou organisateur pas encore onboarde)", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-pot-guard-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let julieId: string | null = null;
  let marcId: string | null = null;

  try {
    await supabaseAdmin.from("feature_flags").update({ enabled: true }).eq("key", "pot");

    const title = `Fete cagnotte garde-fou ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;
    await supabaseAdmin
      .from("events")
      .update({ pot_enabled: true, pot_mode: "open", pot_label: "Cadeau collectif" })
      .eq("id", event.id);

    // Julie répond "Je ne peux pas" -> restricted, jamais d'accès cagnotte
    // sans demande + autorisation explicite de l'admin (durcissement Phase 6)
    // : le formulaire de contribution n'est même pas rendu tant que l'accès
    // n'a pas été accordé, aucun appel serveur possible depuis cet écran.
    const julieContext = await browser.newContext();
    const juliePage = await julieContext.newPage();
    const julie = await loginAs(juliePage, `julie-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    julieId = julie.id;
    await submitGuestIdentity(juliePage, "Julie", "+32470000201", "Je ne peux pas");
    await expect(juliePage.getByRole("heading", { name: "Pas de souci !" })).toBeVisible({ timeout: 10_000 });
    await expect(juliePage.getByRole("button", { name: "Contribuer" })).not.toBeVisible();

    // Marc rejoint et est approuvé (statut "approved"), mais l'organisateur
    // n'a jamais terminé son onboarding Stripe : la contribution doit rester
    // bloquée elle aussi, jamais un appel réel à l'API Stripe dans ce cas.
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    const marc = await loginAs(marcPage, `marc-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    marcId = marc.id;
    await submitGuestIdentity(marcPage, "Marc", "+32470000202", "Je viens !");
    await expect(marcPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({ timeout: 10_000 });

    const { data: marcRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id")
      .eq("event_id", event.id)
      .eq("first_name", "Marc")
      .maybeSingle();

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("approved");

    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await marcPage.getByRole("button", { name: "Cagnotte" }).click();
    await marcPage.getByLabel("Montant que tu veux voir arriver dans la cagnotte (net)").fill("10");
    await marcPage.getByRole("button", { name: "Contribuer" }).click();
    await expect(marcPage.getByText("La cagnotte n'est pas disponible pour le moment.")).toBeVisible({
      timeout: 10_000,
    });

    // Aucune ligne pot_contributions créée dans les deux cas : le garde-fou
    // bloque avant même d'atteindre Stripe.
    const { count } = await supabaseAdmin
      .from("pot_contributions")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    expect(count ?? 0).toBe(0);

    await julieContext.close();
    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (julieId) await deleteTestUser(julieId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});

test("l'organisateur d'une cagnotte active ne peut jamais quitter, mais peut dire 'je ne peux pas' et reste admin invisible", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-pot-invisible-admin-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    await supabaseAdmin.from("feature_flags").update({ enabled: true }).eq("key", "pot");

    const title = `Fete admin invisible ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;
    // `pot_owner` est déjà l'hôte par défaut à l'activation (voir wizard) --
    // on le confirme explicitement pour ne dépendre d'aucune hypothèse.
    await supabaseAdmin
      .from("events")
      .update({ pot_enabled: true, pot_mode: "open", pot_label: "Cadeau collectif", pot_owner: host.id })
      .eq("id", event.id);

    // Marc rejoint et est approuvé : il doit voir l'hôte dans "Je viens"
    // avant, puis ne plus le voir du tout une fois que l'hôte répond "non".
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    const marc = await loginAs(marcPage, `marc-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    marcId = marc.id;
    await submitGuestIdentity(marcPage, "Marc", "+32470000301", "Je viens !");
    await expect(marcPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({ timeout: 10_000 });

    const { data: marcRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id")
      .eq("event_id", event.id)
      .eq("first_name", "Marc")
      .maybeSingle();

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("approved");

    // L'hôte voit bien le cadre "Je viens/Peut-être/Je ne peux pas" sur
    // l'Accueil (bug corrigé cette phase : il en était exclu à tort) et
    // aucun bouton "Quitter l'événement" tant que sa cagnotte est active.
    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByRole("button", { name: "Je ne peux pas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Quitter l'événement" })).not.toBeVisible();

    // L'hôte est à la fois `isHost` ET `pot_owner` (cas le plus courant, la
    // cagnotte est portée par l'hôte par défaut) -- `staysInEventReason`
    // priorise "host" dans ce cas (voir page.tsx), donc le message affiché
    // est celui de l'organisateur, pas celui du porteur de cagnotte.
    await page.getByRole("button", { name: "Je ne peux pas" }).click();
    await expect(
      page.getByText("Tu restes dans l'événement en tant qu'organisateur", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Oui, je ne peux pas venir" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status, answer").eq("event_id", event.id).eq("profile_id", host.id).single();
        return data;
      })
      .toMatchObject({ status: "approved", answer: "no" });

    // Marc ne voit plus l'hôte dans "Je viens" (approvedYes filtré sur
    // answer === "yes" strictement), et le chat est masqué chez l'hôte.
    await marcPage.reload();
    await marcPage.getByRole("button", { name: "Personnes" }).click();
    await expect(marcPage.getByText(hostEmail.split("@")[0], { exact: false })).not.toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(
      page.getByText("Le chat n'est pas disponible : tu as indiqué ne pas venir à cet événement.", { exact: false }),
    ).toBeVisible();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});

test("les messages systeme du chat gardent le nom figé au moment de l'evenement (jamais recalcule apres coup)", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-pot-chat-names-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let julieId: string | null = null;

  try {
    const title = `Fete noms figes ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;

    const julieContext = await browser.newContext();
    const juliePage = await julieContext.newPage();
    const julie = await loginAs(juliePage, `julie-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    julieId = julie.id;
    await submitGuestIdentity(juliePage, "Julie", "+32470000401", "Je viens !");
    await expect(juliePage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({ timeout: 10_000 });

    const { data: julieRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id")
      .eq("event_id", event.id)
      .eq("first_name", "Julie")
      .maybeSingle();

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", julieRsvp!.id).single();
        return data?.status;
      })
      .toBe("approved");

    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Julie Untel a rejoint la fête !", { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    // Julie quitte : message "a quitté la fête" avec son vrai nom encore
    // figé (system_author_name posé à l'insertion), jamais "Anonyme" pour ce
    // message précis même si sa ligne rsvps est ensuite anonymisée.
    await juliePage.goto(`/e/${event.short_code}`);
    await juliePage.getByRole("button", { name: "Quitter l'événement" }).click();
    await juliePage.getByRole("button", { name: "Oui, quitter" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", julieRsvp!.id).single();
        return data?.status;
      })
      .toBe("left");

    await page.reload();
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Julie Untel a quitté la fête.", { exact: false })).toBeVisible({
      timeout: 10_000,
    });

    // Confirmation en base : le nom figé du message système reste bien le
    // vrai nom, alors que la ligne rsvps elle-même est déjà anonymisée.
    const { data: leftMessage } = await supabaseAdmin
      .from("messages")
      .select("system_author_name, body")
      .eq("rsvp_id", julieRsvp!.id)
      .eq("is_system", true)
      .eq("body", "left")
      .maybeSingle();
    expect(leftMessage?.system_author_name).toContain("Julie");

    const { data: anonymizedRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("first_name")
      .eq("id", julieRsvp!.id)
      .single();
    expect(anonymizedRsvp?.first_name).toBeNull();

    await julieContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (julieId) await deleteTestUser(julieId);
    await deleteTestUser(host.id);
  }
});
