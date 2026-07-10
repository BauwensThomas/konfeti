import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function authedClientFor(email: string) {
  const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  await client.auth.verifyOtp({
    token_hash: linkData!.properties!.hashed_token,
    type: "email",
  });
  return client;
}

// Retour Thomas : "j'ai mon 2eme compte qui est admin, et je sais supprime
// ou changer le role de l'organisateur. ce n'est pas logique ca. on ne doit
// jamais savoir changer le role ou supprimer un organisateur." -- vrai trou
// dans set_participant_role/leave_or_remove_participant, qui ne verifiaient
// jamais si la ligne CIBLEE etait celle de l'organisateur (voir migration
// 20260710002100_organizer_untouchable.sql). Regles verifiees ici :
// 1. L'organisateur est intouchable, cote UI (controles absents sur sa ligne)
//    ET cote SQL (filet de securite si l'UI etait contournee).
// 2. Entre admins ordinaires, egalite : n'importe quel admin gere n'importe
//    quel autre admin normalement (non-regression).
test("un admin promu ne peut ni changer le role ni retirer l'organisateur, mais gere un autre admin normalement", async ({
  page,
  browser,
}) => {
  const hostEmail = `e2e-organizer-untouchable-host-${Date.now()}@example.com`;
  const aliceEmail = `e2e-organizer-untouchable-alice-${Date.now()}@example.com`;
  const bobEmail = `e2e-organizer-untouchable-bob-${Date.now()}@example.com`;
  let hostId: string | null = null;
  let aliceId: string | null = null;
  let bobId: string | null = null;
  let eventId: string | null = null;

  try {
    const host = await loginAs(page, hostEmail);
    hostId = host.id;

    const title = `E2E organizer untouchable ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 20, 1000 Bruxelles");
    await page.getByRole("button", { name: "Suivant" }).click();
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
    eventId = event.id;

    // Alice et Bob rejoignent avec un vrai compte, tous deux promus admin.
    const aliceContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    const alice = await loginAs(alicePage, aliceEmail, `/e/${event.short_code}`);
    aliceId = alice.id;
    await alicePage.getByPlaceholder("Julie").fill("Alice");
    await alicePage.getByPlaceholder("Dean").fill("Untel");
    await alicePage.getByPlaceholder("+32 470 00 00 00").fill("+32470000091");
    await alicePage.getByLabel("Une femme").check();
    await alicePage.getByRole("button", { name: "Avatar 3" }).click();
    await alicePage.getByLabel("Je viens !").check();
    await alicePage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(alicePage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    const bobContext = await browser.newContext();
    const bobPage = await bobContext.newPage();
    const bob = await loginAs(bobPage, bobEmail, `/e/${event.short_code}`);
    bobId = bob.id;
    await bobPage.getByPlaceholder("Julie").fill("Bob");
    await bobPage.getByPlaceholder("Dean").fill("Untel");
    await bobPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000092");
    await bobPage.getByLabel("Un homme").check();
    await bobPage.getByRole("button", { name: "Avatar 3" }).click();
    await bobPage.getByLabel("Je viens !").check();
    await bobPage.getByRole("button", { name: "Envoyer ma réponse" }).click();
    await expect(bobPage.getByText("Ta demande est chez l'organisateur !")).toBeVisible({
      timeout: 10_000,
    });

    // L'hôte visite la page (crée sa propre ligne rsvps paresseusement, voir
    // ensure_own_rsvp) puis approuve et promeut Alice et Bob comme admins.
    await page.goto(`/e/${event.short_code}`);
    await page.getByRole("button", { name: "Personnes" }).click();
    await page.getByRole("button", { name: "Approuver comme invité" }).first().click();
    await page.getByRole("button", { name: "Approuver comme invité" }).first().click();
    await page.locator("li", { hasText: "Alice Untel" }).getByRole("combobox").selectOption("admin");
    await page.locator("li", { hasText: "Bob Untel" }).getByRole("combobox").selectOption("admin");

    // L'hôte a lui aussi sa propre ligne rsvps (créée paresseusement par
    // ensure_own_rsvp, role='admin' par défaut) : les trois se retrouvent
    // admins à ce stade.
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin
          .from("rsvps")
          .select("profile_id, role")
          .eq("event_id", event.id)
          .eq("status", "approved")
          .eq("role", "admin");
        return data?.map((r) => r.profile_id).sort();
      })
      .toEqual([hostId, aliceId, bobId].sort());

    const { data: hostRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id")
      .eq("event_id", event.id)
      .eq("profile_id", hostId)
      .single();
    const hostRsvpId = hostRsvp!.id;

    const { data: bobRsvp } = await supabaseAdmin
      .from("rsvps")
      .select("id")
      .eq("event_id", event.id)
      .eq("profile_id", bobId)
      .single();
    const bobRsvpId = bobRsvp!.id;

    // Côté UI (chez Alice, admin) : la ligne de l'organisateur n'affiche ni
    // le sélecteur de rôle, ni le bouton "Retirer".
    await alicePage.goto(`/e/${event.short_code}`);
    await alicePage.getByRole("button", { name: "Personnes" }).click();
    const hostRow = alicePage.locator("li").filter({ hasText: "Organisateur" });
    await expect(hostRow).toBeVisible();
    await expect(hostRow.getByRole("combobox")).toHaveCount(0);
    await expect(hostRow.getByRole("button", { name: "Retirer" })).toHaveCount(0);

    // Côté SQL : même en appelant directement les fonctions RPC en tant
    // qu'Alice (filet de sécurité si l'UI était contournée), viser la ligne
    // de l'organisateur échoue explicitement.
    const supabaseAsAlice = await authedClientFor(aliceEmail);
    const { error: roleError } = await supabaseAsAlice.rpc("set_participant_role", {
      p_rsvp_id: hostRsvpId,
      p_role: "guest",
    });
    expect(roleError?.message).toContain("cannot change the organizer role");

    const { error: removeError } = await supabaseAsAlice.rpc("leave_or_remove_participant", {
      p_rsvp_id: hostRsvpId,
      p_new_status: "removed",
    });
    expect(removeError?.message).toContain("organizer cannot");

    const { data: hostRsvpAfter } = await supabaseAdmin
      .from("rsvps")
      .select("role, status")
      .eq("id", hostRsvpId)
      .single();
    expect(hostRsvpAfter?.role).toBe("admin");
    expect(hostRsvpAfter?.status).toBe("approved");

    // Non-régression : entre admins ordinaires (ni Alice ni Bob organisateur),
    // égalité -- Alice peut rétrograder Bob normalement.
    const { error: peerError } = await supabaseAsAlice.rpc("set_participant_role", {
      p_rsvp_id: bobRsvpId,
      p_role: "guest",
    });
    expect(peerError).toBeNull();

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("role").eq("id", bobRsvpId).single();
        return data?.role;
      })
      .toBe("guest");

    await aliceContext.close();
    await bobContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (hostId) await deleteTestUser(hostId);
    if (aliceId) await deleteTestUser(aliceId);
    if (bobId) await deleteTestUser(bobId);
  }
});
