import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Retour Thomas : "si un sondage 'choix unique' (menu resto)... je sais voter
// pour les 3 c'est un problème... j'ai le droit qu'à un menu" -- budget
// partagé "1 + accompagnants" à répartir entre les options d'un même
// sondage. Vérifie le quota lui-même (stepper -/+, budget qui grandit avec
// un accompagnant ajouté) ET le cas de dépassement après retrait d'un
// accompagnant (bandeau d'avertissement sur l'Accueil, corrigible dans
// Participer).
test("sondage a choix unique : quota 1+accompagnants, budget qui grandit/retrecit, avertissement de depassement", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const hostEmail = `e2e-polls-quota-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete sondage quota ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 20, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Ajouter un sondage" }).click();
    await page.getByLabel("Question du sondage 1").fill("Quel menu ?");
    await page.getByLabel("Option 1 du sondage 1").fill("Poisson");
    await page.getByLabel("Option 2 du sondage 1").fill("Viande");
    await page.getByRole("button", { name: "Choix unique" }).click();

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

    // Marc rejoint SANS accompagnant : budget de 1.
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    const marc = await loginAs(marcPage, `marc-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    marcId = marc.id;
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000088");
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

    // Budget de 1 : un seul vote possible, réparti entre les options.
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await expect(marcPage.getByText("Il te reste 1 vote à répartir")).toBeVisible();
    await marcPage.getByRole("button", { name: "Ajouter un vote pour Poisson" }).click();
    await expect(marcPage.getByText("Tous tes votes sont utilisés")).toBeVisible({ timeout: 15_000 });
    await expect(marcPage.getByRole("button", { name: "Ajouter un vote pour Viande" })).toBeDisabled();

    // Marc ajoute un accompagnant (Accueil) : le budget grandit à 2.
    await marcPage.getByRole("button", { name: "Accueil" }).click();
    await marcPage.getByRole("button", { name: "+ Ajouter un accompagnant" }).click();
    await marcPage.getByRole("dialog").getByRole("button", { name: "+ Ajouter un accompagnant" }).click();
    await expect(marcPage.getByText("Conjoint")).toBeVisible({ timeout: 15_000 });

    await marcPage.getByRole("button", { name: "Participer" }).click();
    await expect(marcPage.getByText("Il te reste 1 vote à répartir")).toBeVisible({ timeout: 15_000 });
    await marcPage.getByRole("button", { name: "Ajouter un vote pour Viande" }).click();
    await expect(marcPage.getByText("Tous tes votes sont utilisés")).toBeVisible({ timeout: 15_000 });

    // Marc retire son accompagnant SANS ajuster ses votes (retour Thomas :
    // "je retire un accompagnant, comment savoir lequel vote retirer ?" --
    // personne ne décide à sa place) : budget revenu à 1, mais 2 votes
    // toujours alloués -- dépassement.
    await marcPage.getByRole("button", { name: "Accueil" }).click();
    await marcPage.getByRole("button", { name: "Retirer cet accompagnant" }).click();
    await marcPage.getByRole("button", { name: "Confirmer le retrait" }).click();
    await expect(
      marcPage.getByText("Tu as des votes en trop sur un sondage (accompagnant retiré ?)."),
    ).toBeVisible({ timeout: 15_000 });

    // Le raccourci "Voir dans Participer" mène directement au sondage, avec
    // un message de dépassement explicite et le -/+ pour se corriger
    // soi-même (aucun retrait automatique, voir commentaire ci-dessus).
    await marcPage.getByRole("button", { name: "Voir dans Participer" }).click();
    await expect(marcPage.getByText("Tu as 1 vote de trop, retire-le ci-dessous.")).toBeVisible();
    await marcPage.getByRole("button", { name: "Retirer un vote pour Viande" }).click();
    await expect(marcPage.getByText("Tous tes votes sont utilisés")).toBeVisible({ timeout: 15_000 });

    await marcPage.getByRole("button", { name: "Accueil" }).click();
    await expect(
      marcPage.getByText("Tu as des votes en trop sur un sondage (accompagnant retiré ?)."),
    ).not.toBeVisible({ timeout: 15_000 });

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});
