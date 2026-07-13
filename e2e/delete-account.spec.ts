import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Suppression de compte en libre-service (retour Thomas : "on doit pouvoir
// supprimer son compte, et effacer toutes les données... retirer toutes les
// infos du profil, passer les messages dans le chat en anonyme, retirer le
// vote dans les sondages, de qui apporte quoi avec les +1 compris"), brief
// section 9/4.8. Bloquée tant qu'on organise encore un événement.
test("un organisateur ne peut pas supprimer son compte tant qu'il heberge un evenement", async ({ page }) => {
  const hostEmail = `e2e-delete-hosting-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Fete suppression bloquee ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 23, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id")
      .eq("title", title)
      .maybeSingle();
    if (!event) throw new Error("evenement introuvable");
    eventId = event.id;

    await page.goto("/profil");
    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    await page.getByRole("button", { name: "Oui, supprimer mon compte" }).click();
    await expect(
      page.getByText(
        "Tu organises encore au moins un événement : transfère l'organisation à quelqu'un d'autre avant de supprimer ton compte.",
      ),
    ).toBeVisible({ timeout: 10_000 });

    // Le compte existe toujours : une nouvelle connexion avec le même email
    // retombe sur le même utilisateur.
    const { data: userAfter } = await supabaseAdmin.auth.admin.getUserById(host.id);
    expect(userAfter.user).not.toBeNull();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
  }
});

test("suppression de compte : profil efface, messages anonymises, votes/qui-apporte-quoi/accompagnants retires, compte reellement supprime", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const hostEmail = `e2e-delete-host-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete suppression compte ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 24, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();

    await page.getByRole("button", { name: "Ajouter un produit" }).click();
    await page.getByPlaceholder("Ex. Bouteilles de soda, gâteau, glaçons...").fill("Chips");
    await page.getByLabel("Quantité demandée pour l'item 1").fill("4");
    await page.getByRole("button", { name: "Unité pour l'item 1" }).click();
    await page.getByRole("button", { name: "Pièce(s)", exact: true }).click();

    await page.getByRole("button", { name: "Ajouter un sondage" }).click();
    await page.getByLabel("Question du sondage 1").fill("Quelle musique ?");
    await page.getByLabel("Option 1 du sondage 1").fill("Rock");
    await page.getByLabel("Option 2 du sondage 1").fill("Pop");

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
    const marcEmail = `marc-delete-${Date.now()}@test.konfeti.local`;
    const marc = await loginAs(marcPage, marcEmail, `/e/${event.short_code}`);
    marcId = marc.id;
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000085");
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

    // Marc prend des engagements : un item, un vote, un accompagnant, et un
    // message de chat (qui, lui, ne doit JAMAIS être supprimé -- seulement
    // anonymisé, retour Thomas).
    await marcPage.goto(`/e/${event.short_code}`);
    await marcPage.getByRole("button", { name: "Participer" }).click();
    await marcPage.getByLabel("Ma quantité").fill("2");
    await marcPage.getByRole("button", { name: "J'apporte" }).click();
    await expect(marcPage.getByText("2 pièces / 4 pièces")).toBeVisible({ timeout: 15_000 });
    await marcPage.getByRole("listitem").filter({ hasText: "Rock" }).getByRole("checkbox").check();
    await expect(marcPage.getByRole("listitem").filter({ hasText: "Rock" })).toContainText("1 vote", {
      timeout: 15_000,
    });

    await marcPage.getByRole("button", { name: "Accueil" }).click();
    await marcPage.getByRole("button", { name: "+ Ajouter un accompagnant" }).click();
    await marcPage.getByRole("dialog").getByRole("button", { name: "+ Ajouter un accompagnant" }).click();
    await expect(marcPage.getByText("Conjoint")).toBeVisible({ timeout: 15_000 });

    await marcPage.getByRole("button", { name: "Chat" }).click();
    await marcPage.getByPlaceholder("Écris un message...").fill("Salut, hâte d'y être !");
    await marcPage.getByRole("button", { name: "Envoyer" }).click();
    await expect(marcPage.getByText("Salut, hâte d'y être !")).toBeVisible({ timeout: 10_000 });

    // Marc supprime son compte depuis son profil.
    await marcPage.goto("/profil");
    await marcPage.getByRole("button", { name: "Supprimer mon compte" }).click();
    await marcPage.getByRole("button", { name: "Oui, supprimer mon compte" }).click();
    await expect(marcPage).toHaveURL(/\/fr$/, { timeout: 15_000 });

    // Le compte n'existe plus du tout (pas juste déconnecté).
    const { data: userAfter, error: userAfterError } = await supabaseAdmin.auth.admin.getUserById(marcId);
    expect(userAfter.user ?? null).toBeNull();
    marcId = null; // deja supprime, inutile (et en erreur) de le refaire au nettoyage
    void userAfterError;

    // Sa ligne de participation reste (les autres participants la voyaient),
    // mais entièrement anonymisée -- plus aucune donnée personnelle.
    const { data: rsvpAfter } = await supabaseAdmin
      .from("rsvps")
      .select("first_name, last_name, phone, avatar_kind, avatar_value, is_anonymized, profile_id, status")
      .eq("id", marcRsvp!.id)
      .single();
    expect(rsvpAfter?.first_name).toBeNull();
    expect(rsvpAfter?.last_name).toBeNull();
    expect(rsvpAfter?.phone).toBeNull();
    expect(rsvpAfter?.avatar_kind).toBe("preset");
    expect(rsvpAfter?.avatar_value).toBe("anonymous");
    expect(rsvpAfter?.is_anonymized).toBe(true);
    expect(rsvpAfter?.profile_id).toBeNull();
    expect(rsvpAfter?.status).toBe("left");

    // Votes, qui-apporte-quoi et accompagnants : entièrement retirés (pas
    // seulement délaissés, retour Thomas : "retirer le vote dans les
    // sondages, de qui apporte quoi avec les +1 compris").
    const { data: votesAfter } = await supabaseAdmin.from("poll_votes").select("id").eq("rsvp_id", marcRsvp!.id);
    expect(votesAfter ?? []).toHaveLength(0);
    const { data: claimsAfter } = await supabaseAdmin.from("bring_claims").select("id").eq("rsvp_id", marcRsvp!.id);
    expect(claimsAfter ?? []).toHaveLength(0);
    const { data: companionsAfter } = await supabaseAdmin
      .from("companions")
      .select("id")
      .eq("rsvp_id", marcRsvp!.id);
    expect(companionsAfter ?? []).toHaveLength(0);

    // Le message de chat, lui, reste -- mais s'affiche "Anonyme" (jointure
    // sur la ligne rsvps désormais anonymisée).
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Chat" }).click();
    await expect(page.getByText("Salut, hâte d'y être !")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Anonyme").first()).toBeVisible();

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});
