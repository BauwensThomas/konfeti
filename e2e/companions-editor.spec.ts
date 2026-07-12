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

// Retour Thomas : "si une personne inscrite, ne peut pas rajouter par après
// des +1 ou retirer" -- ajout d'un accompagnant après l'inscription, puis
// retrait avec récapitulatif des engagements ("qui apporte quoi" + sondages)
// pris pour cette venue, ajustables au moment précis du retrait plutôt que
// jamais (retour Thomas : "qu'on demande qu'est-ce qu'il faut retirer...
// comme ça ça mettra tout à jour directement sans avoir d'erreur dans les
// sondages"). Couvre aussi le cas d'usage exact remonté par Thomas : un
// retrait PARTIEL sur une unité continue (kg), pas juste "tout retirer".
test("ajout d'un accompagnant apres l'inscription, puis retrait avec ajustement partiel d'un engagement et un sondage laisse intact", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const hostEmail = `e2e-companions-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete accompagnants ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 21, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Ajouter un produit" }).click();
    await page.getByPlaceholder("Ex. Bouteilles de soda, gâteau, glaçons...").fill("Glaçons");
    await page.getByLabel("Quantité demandée pour l'item 1").fill("5");
    await selectUnit(page, "Unité pour l'item 1", "Kilo(s)");

    await page.getByRole("button", { name: "Ajouter un sondage" }).click();
    await page.getByLabel("Question du sondage 1").fill("Quel dessert ?");
    await page.getByLabel("Option 1 du sondage 1").fill("Tarte");
    await page.getByLabel("Option 2 du sondage 1").fill("Glace");

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
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000087");
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

    // Marc prend des engagements : 1.5 kg de glaçons et vote "Tarte".
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await expect(marcPage.getByText("0 kg / 5 kg")).toBeVisible();
    await marcPage.getByLabel("Ma quantité").fill("1.5");
    await marcPage.getByRole("button", { name: "J'apporte" }).click();
    await expect(marcPage.getByText("1.5 kg / 5 kg")).toBeVisible({ timeout: 15_000 });
    await marcPage.getByRole("listitem").filter({ hasText: "Tarte" }).getByRole("checkbox").check();
    await expect(marcPage.getByRole("listitem").filter({ hasText: "Tarte" })).toContainText("1 vote", {
      timeout: 15_000,
    });

    // Ajout d'un accompagnant APRÈS l'inscription (pas au moment du RSVP).
    await marcPage.getByRole("button", { name: "Accueil" }).click();
    await marcPage.getByRole("button", { name: "+ Ajouter un accompagnant" }).click();
    await marcPage.getByRole("dialog").getByRole("button", { name: "+ Ajouter un accompagnant" }).click();
    await expect(marcPage.getByText("Conjoint")).toBeVisible({ timeout: 15_000 });

    // Retrait de l'accompagnant : le récapitulatif montre les DEUX
    // engagements pris par Marc (pas propres à l'accompagnant lui-même --
    // personne ne peut deviner lequel lui correspondait, voir le composant).
    await marcPage.getByRole("button", { name: "Retirer cet accompagnant" }).click();
    await expect(marcPage.getByText("Tu as déjà pris des engagements pour ta venue.", { exact: false })).toBeVisible();
    await expect(marcPage.getByText("Glaçons : 1.5 kg")).toBeVisible();
    await expect(marcPage.getByText("Quel dessert ? : Tarte x1")).toBeVisible();

    const removeDialog = marcPage.getByRole("dialog");
    const glaconsAmount = removeDialog.getByLabel("Quantité à retirer pour Glaçons");
    await expect(glaconsAmount).toHaveValue("0");

    // Retrait PARTIEL (retour Thomas : "ce n'est pas mieux de demander la
    // quantité à retirer ?" -- 1.2 kg sur les 1.5 kg apportés), le vote
    // "Tarte" reste intact (jamais coché pour retrait).
    await glaconsAmount.fill("1.2");
    await removeDialog.getByRole("button", { name: "Confirmer le retrait" }).click();

    await expect(marcPage.getByText("Conjoint")).not.toBeVisible({ timeout: 15_000 });

    const { data: claimAfter } = await supabaseAdmin
      .from("bring_claims")
      .select("quantity")
      .eq("rsvp_id", marcRsvp!.id)
      .maybeSingle();
    expect(claimAfter?.quantity).toBeCloseTo(0.3, 5);

    await marcPage.getByRole("button", { name: "Participer" }).click();
    await expect(marcPage.getByText("0.3 kg / 5 kg")).toBeVisible({ timeout: 15_000 });
    await expect(marcPage.getByRole("listitem").filter({ hasText: "Tarte" }).getByRole("checkbox")).toBeChecked();

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});
