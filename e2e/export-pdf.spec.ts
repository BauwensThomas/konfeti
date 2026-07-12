import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Export PDF participants (brief 4.13, `/api/export/[shortCode]`), réservé
// aux admins -- généré à la volée, jamais stocké. Vérifie le contrôle
// d'accès (non-admin, visiteur sans session) ET qu'un admin obtient bien un
// PDF exploitable, sans avoir à parser le binaire lui-même.
test("l'export PDF est reserve aux admins (401 sans session, 403 pour un simple invite, 200 pour l'hote)", async ({
  page,
  browser,
  request,
}) => {
  const hostEmail = `e2e-export-pdf-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete export pdf ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 22, 1000 Bruxelles");
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

    // Visiteur sans session du tout : 401. Le fixture `request` (pas un
    // contexte navigateur manuel) est celui garanti par Playwright pour
    // respecter le `baseURL` du projet sans dépendre d'un `page.goto()`
    // préalable pour l'établir.
    const anonResponse = await request.get(`/api/export/${event.short_code}`);
    expect(anonResponse.status()).toBe(401);

    // Marc rejoint en simple invité (pas admin) : 403.
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    const marc = await loginAs(marcPage, `marc-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    marcId = marc.id;
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000086");
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

    const marcResponse = await marcPage.request.get(`/api/export/${event.short_code}`);
    expect(marcResponse.status()).toBe(403);

    // Le bouton "Export PDF" n'est d'ailleurs jamais affiché à un simple
    // invité (réservé aux admins, voir e/[shortCode]/page.tsx).
    await marcPage.goto(`/e/${event.short_code}`);
    await expect(marcPage.getByRole("link", { name: "Export PDF" })).not.toBeVisible();

    // L'hôte (admin) obtient un vrai PDF, jamais stocké, avec le bon nom de
    // fichier proposé au téléchargement.
    await expect(page.getByRole("link", { name: "Export PDF" })).toBeVisible();
    const hostResponse = await page.request.get(`/api/export/${event.short_code}`);
    expect(hostResponse.status()).toBe(200);
    expect(hostResponse.headers()["content-type"]).toBe("application/pdf");
    expect(hostResponse.headers()["content-disposition"]).toContain(
      `participants-${event.short_code}.pdf`,
    );
    const body = await hostResponse.body();
    // Signature de fichier PDF ("%PDF-"), preuve que pdf-lib a bien produit
    // un document exploitable et pas une page d'erreur silencieuse.
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});
