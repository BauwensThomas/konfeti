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
  answerLabel: "Je viens !" | "Peut-être" | "Je ne peux pas",
) {
  await guestPage.goto(`/e/${shortCode}`);
  await guestPage.getByRole("button", { name: "Continuer sans compte" }).click();
  await guestPage.getByPlaceholder("Julie").fill(firstName);
  await guestPage.getByPlaceholder("Dean").fill("Untel");
  await guestPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000095");
  await guestPage.getByLabel("Un homme").check();
  await guestPage.getByRole("button", { name: "Avatar 1" }).click();
  await guestPage.getByLabel(answerLabel).check();
  await guestPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
}

test("validation par un admin, promotion en admin, retrait et depart volontaire", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-validation-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  const guestIds: string[] = [];

  try {
    const title = `Fete validation ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;

    // Premier invite : repond "je viens", atterrit en attente.
    const guest1Context = await browser.newContext();
    const guest1Page = await guest1Context.newPage();
    await submitGuestIdentity(guest1Page, event.short_code, "Marc", "Je viens !");
    await expect(guest1Page.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    const { data: rsvp1 } = await supabaseAdmin
      .from("rsvps")
      .select("id, profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Marc")
      .maybeSingle();
    guestIds.push(rsvp1!.profile_id);

    // L'hote consulte l'onglet Personnes et approuve.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status, role").eq("id", rsvp1!.id).single();
        return data?.status;
      })
      .toBe("approved");

    // L'invite voit desormais l'acces complet.
    await guest1Page.goto(`/e/${event.short_code}`);
    await expect(guest1Page.getByRole("heading", { name: title })).toBeVisible();

    // L'hote promeut Marc administrateur.
    await page.reload();
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("combobox").first().selectOption("admin");

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("role").eq("id", rsvp1!.id).single();
        return data?.role;
      })
      .toBe("admin");

    // Un deuxieme invite se presente ; Marc (desormais admin) peut l'approuver lui-meme.
    const guest2Context = await browser.newContext();
    const guest2Page = await guest2Context.newPage();
    await submitGuestIdentity(guest2Page, event.short_code, "Sophie", "Je viens !");
    await expect(guest2Page.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    const { data: rsvp2 } = await supabaseAdmin
      .from("rsvps")
      .select("id, profile_id")
      .eq("event_id", event.id)
      .eq("first_name", "Sophie")
      .maybeSingle();
    guestIds.push(rsvp2!.profile_id);

    await guest1Page.goto(`/e/${event.short_code}`);
    await guest1Page.getByRole("button", { name: "Personnes" }).click();
    await guest1Page.getByRole("button", { name: "Approuver comme invité" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", rsvp2!.id).single();
        return data?.status;
      })
      .toBe("approved");

    // L'hote retire Sophie (Marc est aussi approuve a ce stade, on cible bien sa ligne a elle).
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.locator("li", { hasText: "Sophie" }).getByRole("button", { name: "Retirer" }).click();
    await page.getByRole("button", { name: "Oui, retirer" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("rsvps")
          .select("status, is_anonymized, first_name")
          .eq("id", rsvp2!.id)
          .single();
        return data;
      })
      .toMatchObject({ status: "removed", is_anonymized: true, first_name: null });

    // Marc quitte l'evenement de lui-meme depuis sa propre carte de participation.
    await guest1Page.goto(`/e/${event.short_code}`);
    await guest1Page.getByRole("button", { name: "Quitter l'événement" }).click();
    await guest1Page.getByRole("button", { name: "Oui, quitter" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("rsvps")
          .select("status, is_anonymized")
          .eq("id", rsvp1!.id)
          .single();
        return data;
      })
      .toMatchObject({ status: "left", is_anonymized: true });

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

test("acces restreint (je peux pas), cagnotte masquee au beneficiaire, et retour en arriere", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-restricted-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let guestId: string | null = null;

  try {
    const title = `Fete restreinte ${Date.now()}`;
    const event = await createTestEvent(page, title);
    eventId = event.id;

    await supabaseAdmin
      .from("events")
      .update({ pot_enabled: true, pot_mode: "open", pot_label: "Cadeau surprise" })
      .eq("id", event.id);

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    // "Je peux pas" bascule directement en acces restreint, sans jamais passer par pending.
    await submitGuestIdentity(guestPage, event.short_code, "Julie", "Je ne peux pas");
    await expect(guestPage.getByText("Cadeau surprise", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect(guestPage.getByText("Ta demande est chez l'organisateur !")).not.toBeVisible();

    const { data: rsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id, profile_id, status")
      .eq("event_id", event.id)
      .eq("first_name", "Julie")
      .maybeSingle();
    expect(rsvp?.status).toBe("restricted");
    guestId = rsvp!.profile_id;

    // Elle change d'avis : repasse dans le circuit normal de validation.
    await guestPage.getByRole("button", { name: "Je viens !" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", rsvp!.id).single();
        return data?.status;
      })
      .toBe("pending");

    // L'hote l'approuve comme beneficiaire.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme bénéficiaire" }).click();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status, role").eq("id", rsvp!.id).single();
        return data?.role;
      })
      .toBe("beneficiary");

    // Une fois beneficiaire, elle voit l'evenement complet mais jamais la cagnotte.
    await guestPage.goto(`/e/${event.short_code}`);
    await expect(guestPage.getByRole("heading", { name: title })).toBeVisible();
    await expect(guestPage.getByText("Cadeau surprise", { exact: false })).not.toBeVisible();

    // Elle change a nouveau d'avis vers "je peux pas" : redevient restreinte.
    await guestPage.getByRole("button", { name: "Je ne peux pas" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", rsvp!.id).single();
        return data?.status;
      })
      .toBe("restricted");

    await guestPage.reload();
    await expect(guestPage.getByText("Cadeau surprise", { exact: false })).toBeVisible();

    await guestContext.close();
  } finally {
    if (eventId) {
      await supabaseAdmin.from("events").delete().eq("id", eventId);
    }
    if (guestId) await deleteTestUser(guestId);
    await deleteTestUser(host.id);
  }
});
