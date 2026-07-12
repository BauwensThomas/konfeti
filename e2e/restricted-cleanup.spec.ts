import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function selectUnit(page: import("@playwright/test").Page, buttonName: string, unitLabel: string) {
  await page.getByRole("button", { name: buttonName }).click();
  await page.getByRole("button", { name: unitLabel, exact: true }).click();
}

// Retour Thomas : "être certain que si quelqu'un dit qu'il ne participe pas
// à l'event ou le quitte, que toutes les choses qu'il apporte, les sondages
// de lui et ses +1 disparaîtront et que le chat viendra avec un nom anonyme
// avec une photo de profil anonyme." Contrairement à quitter, "Je ne peux
// pas" reste réversible : ce test vérifie le nettoyage complet ET la
// restauration de l'identité (chat compris) quand la personne revient sur
// "Je viens" (voir migration 20260713000200_restricted_full_cleanup.sql).
test("Je ne peux pas retire accompagnants/qui-apporte-quoi/sondages et anonymise le chat, revenir sur Je viens restaure l'identite", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const hostEmail = `e2e-restricted-cleanup-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete nettoyage restreint ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 25, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Ajouter un produit" }).click();
    await page.getByPlaceholder("Ex. Bouteilles de soda, gâteau, glaçons...").fill("Jus d'orange");
    await page.getByLabel("Quantité demandée pour l'item 1").fill("3");
    await selectUnit(page, "Unité pour l'item 1", "Litre(s)");

    await page.getByRole("button", { name: "Ajouter un sondage" }).click();
    await page.getByLabel("Question du sondage 1").fill("Quel jeu ?");
    await page.getByLabel("Option 1 du sondage 1").fill("Cartes");
    await page.getByLabel("Option 2 du sondage 1").fill("Loup-garou");

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
    const marc = await loginAs(marcPage, `marc-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    marcId = marc.id;
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000084");
    await marcPage.getByLabel("Un homme").check();
    await marcPage.getByRole("button", { name: "Avatar 1" }).click();
    await marcPage.getByLabel("Je viens !").check();
    await marcPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
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

    // Marc prend des engagements + un accompagnant + envoie un message.
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await marcPage.getByLabel("Ma quantité").fill("1");
    await marcPage.getByRole("button", { name: "J'apporte" }).click();
    await expect(marcPage.getByText("1 L / 3 L")).toBeVisible({ timeout: 15_000 });
    await marcPage.getByRole("listitem").filter({ hasText: "Cartes" }).getByRole("checkbox").check();
    await expect(marcPage.getByRole("listitem").filter({ hasText: "Cartes" })).toContainText("1 vote", {
      timeout: 15_000,
    });

    await marcPage.getByRole("button", { name: "Accueil" }).click();
    await marcPage.getByRole("button", { name: "+ Ajouter un accompagnant" }).click();
    await marcPage.getByRole("dialog").getByRole("button", { name: "+ Ajouter un accompagnant" }).click();
    await expect(marcPage.getByText("Conjoint")).toBeVisible({ timeout: 15_000 });

    await marcPage.getByRole("button", { name: "Chat" }).click();
    await marcPage.getByPlaceholder("Écris un message...").fill("Salut !");
    await marcPage.getByRole("button", { name: "Envoyer" }).click();
    await expect(marcPage.getByText("Salut !")).toBeVisible({ timeout: 10_000 });

    // Marc dit "Je ne peux pas" (confirmation requise, action destructive).
    await marcPage.getByRole("button", { name: "Accueil" }).click();
    await marcPage.getByRole("button", { name: "Je ne peux pas" }).click();
    await marcPage.getByRole("button", { name: "Oui, je ne peux pas venir" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("restricted");

    const { data: rsvpAfterNo } = await supabaseAdmin
      .from("rsvps")
      .select("first_name, is_anonymized")
      .eq("id", marcRsvp!.id)
      .single();
    expect(rsvpAfterNo?.first_name).toBeNull();
    expect(rsvpAfterNo?.is_anonymized).toBe(true);

    const { data: companionsAfterNo } = await supabaseAdmin
      .from("companions")
      .select("id")
      .eq("rsvp_id", marcRsvp!.id);
    expect(companionsAfterNo ?? []).toHaveLength(0);
    const { data: claimsAfterNo } = await supabaseAdmin.from("bring_claims").select("id").eq("rsvp_id", marcRsvp!.id);
    expect(claimsAfterNo ?? []).toHaveLength(0);
    const { data: votesAfterNo } = await supabaseAdmin.from("poll_votes").select("id").eq("rsvp_id", marcRsvp!.id);
    expect(votesAfterNo ?? []).toHaveLength(0);

    // Le message de chat reste, mais s'affiche "Anonyme" (jointure sur la
    // ligne rsvps désormais anonymisée) -- même mécanisme qu'un départ.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Salut !")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Anonyme").first()).toBeVisible();

    // Marc revient sur "Je viens !" : identité restaurée depuis `profiles`
    // (jamais touchée par l'anonymisation), y compris dans le chat. Status
    // "restricted" affiche `GuestRestrictedScreen` (pas d'onglets, pas de
    // bouton "Accueil") -- le bouton "Je viens !" y est déjà visible.
    await expect(marcPage.getByRole("button", { name: "Je viens !" })).toBeVisible({ timeout: 15_000 });
    await marcPage.getByRole("button", { name: "Je viens !" }).click();
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("status").eq("id", marcRsvp!.id).single();
        return data?.status;
      })
      .toBe("pending");

    const { data: rsvpAfterYes } = await supabaseAdmin
      .from("rsvps")
      .select("first_name, is_anonymized")
      .eq("id", marcRsvp!.id)
      .single();
    expect(rsvpAfterYes?.first_name).toBe("Marc");
    expect(rsvpAfterYes?.is_anonymized).toBe(false);

    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).click();
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Salut !")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Marc", { exact: false }).first()).toBeVisible();

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});
