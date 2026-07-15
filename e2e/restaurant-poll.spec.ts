import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Sondage resto (brief 4.6, V1.1). Le lien affilié TheFork (Awin) est testé
// uniquement sur sa forme (fallback sans IDs Awin réels) -- jamais besoin
// d'un compte Awin approuvé pour que cette suite soit verte, voir
// src/lib/awin.test.ts pour la couverture complète de la construction du
// lien. La recherche Google Places réelle (2e test) est sautée si
// `GOOGLE_MAPS_API_KEY` n'est pas configurée dans l'environnement de test.
test("un sondage 'restaurant' affiche le lien Reserver sur TheFork pour chaque option", async ({ page, browser }) => {
  test.setTimeout(60_000);
  const hostEmail = `e2e-restaurant-poll-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete sondage resto ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 6, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Ajouter un sondage" }).click();
    await page.getByLabel("Question du sondage 1").fill("Quel resto ?");
    await page.getByLabel("Option 1 du sondage 1").fill("Chez Julie");
    await page.getByLabel("Option 2 du sondage 1").fill("Chez Marc");

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

    // Simule ce que produirait le wizard une fois une recherche Google
    // Places réelle effectuée (kind='restaurant' + external_url par option) --
    // sans dépendre d'une clé API configurée pour vérifier l'affichage.
    const { data: poll } = await supabaseAdmin
      .from("polls")
      .select("id")
      .eq("event_id", event.id)
      .eq("question", "Quel resto ?")
      .single();
    await supabaseAdmin.from("polls").update({ kind: "restaurant" }).eq("id", poll!.id);
    const { data: options } = await supabaseAdmin
      .from("poll_options")
      .select("id, label")
      .eq("poll_id", poll!.id);
    for (const option of options ?? []) {
      await supabaseAdmin
        .from("poll_options")
        .update({ external_url: `https://www.thefork.fr/search/?query=${encodeURIComponent(option.label)}` })
        .eq("id", option.id);
    }

    // Marc rejoint, est approuvé, et voit le lien TheFork sur chaque option.
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    await loginAs(marcPage, `marc-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000098");
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

    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await expect(marcPage.getByText("Quel resto ?")).toBeVisible();
    const theForkLinks = marcPage.getByRole("link", { name: "Réserver sur TheFork" });
    await expect(theForkLinks).toHaveCount(2);
    await expect(theForkLinks.first()).toHaveAttribute("href", /thefork\.fr\/search/);

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});

test("recherche de vrais restaurants a proximite (Google Places) depuis le wizard", async ({ page }) => {
  // `test.skip` DANS le corps du test (pas au niveau du fichier) : appelé en
  // dehors d'un test, `test.skip(condition, ...)` s'applique à toute la
  // suite qui suit, pas seulement au test visé -- piège rencontré en
  // écrivant ce fichier (le test précédent se retrouvait sauté aussi).
  test.skip(
    !process.env.GOOGLE_MAPS_API_KEY,
    "GOOGLE_MAPS_API_KEY absente de l'environnement de test -- recherche Google Places reelle non testee (voir DECISIONS.md, en attente de la cle Thomas)",
  );
  test.setTimeout(60_000);
  const hostEmail = `e2e-restaurant-search-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);

  try {
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(`Fete recherche resto ${Date.now()}`);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    // Grande gare, adresse stable et peuplée en restaurants -- faible risque
    // de flake sur le nombre de résultats (jamais 0 en pratique).
    await page.getByPlaceholder("Adresse et ville").fill("Bruxelles-Central");
    await page.getByRole("button", { name: /Bruxelles-Central/, exact: false }).first().click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Ajouter un sondage" }).click();
    await page.getByLabel("Question du sondage 1").fill("Quel resto ?");
    await page.getByRole("button", { name: "Restaurant", exact: true }).click();
    await page.getByRole("button", { name: "Rechercher des restaurants à proximité" }).click();
    await expect(page.getByRole("checkbox").first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await deleteTestUser(host.id);
  }
});
