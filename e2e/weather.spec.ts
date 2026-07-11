import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DAY_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

// Même règle que `src/lib/datetime.ts` (`toLocalDateTimeValue`) : jamais
// `toISOString()` pour un input datetime-local, ça convertit en UTC et
// décale l'heure affichée par rapport à l'heure locale attendue.
function toLocalDateTimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function createEventWithDate(page: import("@playwright/test").Page, title: string, startsAt: Date) {
  // Le lien "Créer un événement" n'existe que sur /mes-evenements, jamais sur
  // la page d'un événement déjà créé -- nécessaire ici puisque ce helper est
  // appelé deux fois dans le même test (retour explicite entre les deux).
  await page.goto("/mes-evenements");
  await page.getByRole("link", { name: "Créer un événement" }).click();
  await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
  await page.locator('input[type="datetime-local"]').first().fill(toLocalDateTimeValue(startsAt));
  await page.getByPlaceholder("Adresse et ville").fill("Bruxelles");
  // Recherche Photon (brief 4.6) : suggestion réelle (API publique, gratuite,
  // sans clé, déjà validée en direct pendant la planification) -- attend la
  // suggestion "Bruxelles" et clique dessus, seule façon d'obtenir des
  // coordonnées (jamais un géocodage serveur séparé, voir DECISIONS.md).
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
  return event;
}

test("la météo s'affiche à partir de J-5 pour un lieu géocodé via Photon, jamais hors de cette fenêtre", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const hostEmail = `e2e-weather-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let soonEventId: string | null = null;
  let farEventId: string | null = null;

  try {
    const soonTitle = `Fete meteo proche ${Date.now()}`;
    const soonEvent = await createEventWithDate(page, soonTitle, daysFromNow(3));
    soonEventId = soonEvent.id;
    expect(soonEvent.location_lat).not.toBeNull();
    expect(soonEvent.location_lng).not.toBeNull();

    await page.goto(`/e/${soonEvent.short_code}`);
    // Assertion volontairement lâche (température/condition réelles non
    // déterministes) : le créneau "9h" (matin, retour Thomas : des heures
    // plutôt que "Matin/Après-midi/Soir") + une température au format "N°"
    // suffisent à prouver que les 4 créneaux s'affichent, jamais une valeur
    // météo exacte en dur.
    await expect(page.getByText("9h", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^-?\d+°$/).first()).toBeVisible();

    const farTitle = `Fete meteo lointaine ${Date.now()}`;
    const farEvent = await createEventWithDate(page, farTitle, daysFromNow(20));
    farEventId = farEvent.id;

    await page.goto(`/e/${farEvent.short_code}`);
    await expect(page.getByText("9h", { exact: true })).not.toBeVisible();
  } finally {
    if (soonEventId) await supabaseAdmin.from("events").delete().eq("id", soonEventId);
    if (farEventId) await supabaseAdmin.from("events").delete().eq("id", farEventId);
    await deleteTestUser(host.id);
  }
});

test("un lieu tapé en texte libre sans sélectionner de suggestion n'affiche pas de météo mais ne bloque pas la création", async ({
  page,
}) => {
  const hostEmail = `e2e-weather-freetext-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Fete lieu texte libre ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill(toLocalDateTimeValue(daysFromNow(2)));
    // Adresse volontairement introuvable pour Photon (pas de virgule/ville
    // reconnue) -- aucune suggestion ne sera jamais cliquée, jamais de
    // coordonnées enregistrées.
    await page.getByPlaceholder("Adresse et ville").fill("Chez Mamie, au fond du jardin");
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
    expect(event.location_lat).toBeNull();
    expect(event.location_lng).toBeNull();

    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText("Chez Mamie, au fond du jardin")).toBeVisible();
    await expect(page.getByText("9h", { exact: true })).not.toBeVisible();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
  }
});
