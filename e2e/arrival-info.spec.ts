import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// "Infos pratiques pour venir" (brief 4.6) : le même bloc (Maps/Waze/
// transports en commun) doit apparaître avant le Jour J (carte "date et
// lieu") ET pendant le Jour J (JourJCard) -- voir ArrivalInfoBlock.tsx,
// partagé entre les deux. Les liens Uber/Bolt (pré-remplis "après minuit",
// brief) dépendent de l'heure réelle du serveur au moment du test -- couverts
// exhaustivement par `arrival-info.test.ts` (Vitest), jamais assertés ici
// pour ne pas dépendre de l'heure d'exécution de la suite e2e.
test("le bloc infos pratiques (Maps/Waze/transports en commun) est visible avant et pendant le Jour J", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const hostEmail = `e2e-arrival-info-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Fete infos pratiques ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Bruxelles");
    // Recherche Photon réelle (voir e2e/weather.spec.ts) : seule façon
    // d'obtenir de vraies coordonnées, nécessaires pour les liens Uber/Bolt.
    await page.getByRole("button", { name: "Bruxelles, Belgique", exact: true }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("button", { name: "Créer l'événement" }).click();
    await expect(page).toHaveURL(/\/mes-evenements$/);

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, short_code, location_lat, location_lng")
      .eq("title", title)
      .maybeSingle();
    if (!event) throw new Error("evenement introuvable");
    eventId = event.id;
    expect(event.location_lat).not.toBeNull();
    expect(event.location_lng).not.toBeNull();

    // Avant le Jour J : carte "date et lieu" classique.
    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByRole("link", { name: "Google Maps" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Waze" })).toBeVisible();
    const transitLinkBefore = page.getByRole("link", { name: "Transports en commun" });
    await expect(transitLinkBefore).toBeVisible();
    await expect(transitLinkBefore).toHaveAttribute("href", /travelmode=transit/);

    // Bascule sur AUJOURD'HUI (même trick que jour-j.spec.ts) : le même bloc
    // doit rester visible dans JourJCard.
    await supabaseAdmin.from("events").update({ starts_at: todayAt(18) }).eq("id", eventId);
    await page.reload();
    await expect(page.getByText("C'est le jour J !")).toBeVisible();
    // `.first()` : GoHomeCard (bloc "Rentrer") affiche aussi ses propres
    // liens Google Maps/Waze en parallèle, pour rentrer -- voir GoHomeCard.tsx.
    await expect(page.getByRole("link", { name: "Google Maps" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Waze" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Transports en commun" })).toBeVisible();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
  }
});
