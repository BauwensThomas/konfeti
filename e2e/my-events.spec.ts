import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function completeProfile(
  page: import("@playwright/test").Page,
  firstName: string,
  phone: string,
  avatar: "Avatar 1" | "Avatar 2" | "Avatar 3",
  gender: "Une femme" | "Un homme",
) {
  await page.goto("/profil/completer");
  await page.getByPlaceholder("Julie").fill(firstName);
  await page.getByPlaceholder("Dean").fill("Test");
  await page.getByLabel("Ton numéro de téléphone").fill(phone);
  await page.getByLabel(gender).check();
  await page.getByRole("button", { name: avatar }).click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/mes-evenements$/);
}

async function createTestEvent(page: import("@playwright/test").Page, title: string) {
  await page.getByRole("link", { name: "Créer un événement" }).click();
  await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
  await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
  await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 5, 1000 Bruxelles");
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

// Retour Thomas : "/mes-evenements" ne listait que les événements dont on
// est l'hôte -- élargi pour aussi lister ceux où l'on participe simplement
// (host ET simple invité, ou invité anonyme sans jamais organiser).
test("mes-evenements liste J'organise et Je participe pour qui fait les deux", async ({ page, browser }) => {
  const aliceEmail = `e2e-myevents-alice-${Date.now()}@example.com`;
  const bobEmail = `e2e-myevents-bob-${Date.now()}@example.com`;
  let aliceId: string | null = null;
  let bobId: string | null = null;

  try {
    const alice = await loginAs(page, aliceEmail);
    aliceId = alice.id;
    await completeProfile(page, "Alice", "+32470000091", "Avatar 1", "Une femme");
    const aliceTitle = `E2E organise ${Date.now()}`;
    await createTestEvent(page, aliceTitle);

    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    const bob = await loginAs(bobPage, bobEmail);
    bobId = bob.id;
    await completeProfile(bobPage, "Bob", "+32470000092", "Avatar 2", "Un homme");
    const bobTitle = `E2E participe ${Date.now()}`;
    const bobEvent = await createTestEvent(bobPage, bobTitle);

    // Alice (deja connectee avec un vrai compte) rejoint l'evenement de Bob.
    await page.goto(`/e/${bobEvent.short_code}`);
    await page.getByPlaceholder("Julie").fill("Alice");
    await page.getByPlaceholder("Dean").fill("Test");
    await page.getByPlaceholder("+32 470 00 00 00").fill("+32470000091");
    await page.getByLabel("Une femme").check();
    await page.getByRole("button", { name: "Avatar 1" }).click();
    await page.getByLabel("Je viens !").check();
    await page.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(page.getByText("Ta demande est chez l'organisateur !")).toBeVisible({ timeout: 10_000 });

    await bobPage.goto(`/e/${bobEvent.short_code}`);
    await bobPage.getByRole("button", { name: "Personnes" }).click();
    await bobPage.getByRole("button", { name: "Approuver comme invité" }).click();

    await page.goto("/mes-evenements");
    await expect(page.getByText("J'organise")).toBeVisible();
    await expect(page.getByText("Je participe")).toBeVisible();
    await expect(page.getByText(aliceTitle)).toBeVisible();
    await expect(page.getByText(bobTitle)).toBeVisible();

    await bobContext.close();
  } finally {
    if (aliceId) await deleteTestUser(aliceId);
    if (bobId) await deleteTestUser(bobId);
  }
});

test("un invite anonyme qui participe a plusieurs evenements voit sa liste, et le lien retour", async ({
  page,
  browser,
}) => {
  const host1Email = `e2e-myevents-host1-${Date.now()}@example.com`;
  const host2Email = `e2e-myevents-host2-${Date.now()}@example.com`;
  let host1Id: string | null = null;
  let host2Id: string | null = null;

  try {
    const host1 = await loginAs(page, host1Email);
    host1Id = host1.id;
    await completeProfile(page, "Hote1", "+32470000093", "Avatar 1", "Une femme");
    const title1 = `E2E anon events A ${Date.now()}`;
    const event1 = await createTestEvent(page, title1);

    const host2Context = await browser.newContext();
    const host2Page = await host2Context.newPage();
    const host2 = await loginAs(host2Page, host2Email);
    host2Id = host2.id;
    await completeProfile(host2Page, "Hote2", "+32470000094", "Avatar 2", "Un homme");
    const title2 = `E2E anon events B ${Date.now()}`;
    const event2 = await createTestEvent(host2Page, title2);

    // Marc (invite anonyme "code d'acces") rejoint les DEUX evenements.
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();

    async function joinAsMarc(event: { short_code: string }) {
      await marcPage.goto(`/e/${event.short_code}`);
      const continueBtn = marcPage.getByRole("button", { name: "Continuer sans compte" });
      if (await continueBtn.count()) await continueBtn.click();
      await marcPage.getByPlaceholder("Julie").fill("Marc");
      await marcPage.getByPlaceholder("Dean").fill("Untel");
      await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000095");
      await marcPage.getByLabel("Un homme").check();
      await marcPage.getByRole("button", { name: "Avatar 3" }).click();
      await marcPage.getByLabel("Je viens !").check();
      await marcPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
      await expect(marcPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
        timeout: 10_000,
      });
    }

    await joinAsMarc(event1);
    await joinAsMarc(event2);

    await page.goto(`/e/${event1.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();

    await host2Page.goto(`/e/${event2.short_code}`);
    await host2Page.getByRole("button", { name: "Personnes" }).click();
    await host2Page.getByRole("button", { name: "Approuver comme invité" }).click();

    // La flèche retour du header (qui remplace l'ancien lien texte "Retour à
    // mes événements", devenu redondant) doit être visible et fonctionnelle
    // pour un invité anonyme (retour Thomas), pas seulement un admin.
    await marcPage.goto(`/e/${event1.short_code}`);
    await expect(marcPage.getByRole("button", { name: "Retour" })).toBeVisible();
    await marcPage.getByRole("button", { name: "Retour" }).click();
    await expect(marcPage).toHaveURL(/\/mes-evenements$/);

    await expect(marcPage.getByText(title1)).toBeVisible();
    await expect(marcPage.getByText(title2)).toBeVisible();
    await expect(marcPage.getByText("Invité").first()).toBeVisible();

    await host2Context.close();
    await marcContext.close();
  } finally {
    if (host1Id) await deleteTestUser(host1Id);
    if (host2Id) await deleteTestUser(host2Id);
  }
});
