import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loginAs, deleteTestUser } from "./helpers/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// La création via le wizard refuse une date dans le passé, mais compare un
// horodatage précis (pas une date civile, voir `refineEventFields` dans
// `src/lib/validation/event.ts`) : créer directement "aujourd'hui à 20h" via
// le wizard serait fiable seulement avant 20h, un flake réel selon l'heure
// d'exécution du test. Contournement : créer avec une date future normale,
// puis basculer `starts_at` sur AUJOURD'HUI directement en base (service
// role, contourne complètement la validation zod) -- déterministe peu
// importe l'heure du jour.
function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

test("bascule Accueil en Mode Jour J : arrivée, checklist bien rentré visible de tous, compteur admin", async ({
  page,
  browser,
}) => {
  // Plus long que le défaut (60s) : deux navigateurs (hôte + Marc), plus
  // d'étapes depuis l'ajout du reclic annulable et de la liste admin.
  test.setTimeout(120_000);
  const hostEmail = `e2e-jourj-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;
  let marcId: string | null = null;

  try {
    const title = `Fete jour J ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 9, 1000 Bruxelles");
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

    // Bascule sur AUJOURD'HUI, directement en base (voir commentaire plus haut).
    await supabaseAdmin.from("events").update({ starts_at: todayAt(18) }).eq("id", eventId);

    // Marc rejoint et est approuvé comme invité normal.
    const marcContext = await browser.newContext();
    const marcPage = await marcContext.newPage();
    await loginAs(marcPage, `marc-${Date.now()}@test.konfeti.local`, `/e/${event.short_code}`);
    await marcPage.getByPlaceholder("Julie").fill("Marc");
    await marcPage.getByPlaceholder("Dean").fill("Untel");
    await marcPage.getByPlaceholder("+32 470 00 00 00").fill("+32470000093");
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

    // Marc voit le Mode Jour J (pas la carte date/adresse habituelle), et se
    // check-in.
    await marcPage.goto(`/e/${event.short_code}`);
    await expect(marcPage.getByText("C'est le jour J !")).toBeVisible({ timeout: 10_000 });
    await expect(marcPage.getByText("Rue de Test 9, 1000 Bruxelles")).toBeVisible();
    await expect(marcPage.getByRole("link", { name: "Bolt" })).toBeVisible();
    await expect(marcPage.getByRole("link", { name: "Google Maps" }).first()).toBeVisible();
    await expect(marcPage.getByRole("link", { name: "Waze" }).first()).toBeVisible();

    await marcPage.getByRole("button", { name: "Je suis arrivé !" }).click();
    await expect(marcPage.getByRole("button", { name: "Arrivé !" })).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("checked_in_at").eq("id", marcRsvp!.id).single();
        return data?.checked_in_at;
      })
      .not.toBeNull();

    // L'admin voit le compteur d'arrivées (nombre exact non vérifié, dépend
    // du statut de sa propre ligne hôte -- seul le format est vérifié ici)
    // ET la liste de qui est arrivé (retour Thomas : "les admins voient...
    // qui est là", pas juste un chiffre).
    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText(/\d+\/\d+ arrivés/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Marc")).toBeVisible();

    // Bug réel signalé par Thomas : "Voir qui a apporté quoi" (admin) ouvrait
    // Participer sur le sous-onglet Sondages (par défaut) au lieu d'"À
    // apporter" -- `setActive` doit préciser le sous-onglet cible.
    await page.getByRole("button", { name: "Voir qui a apporté quoi" }).click();
    await expect(page.getByRole("button", { name: "+ Ajouter un item" })).toBeVisible();

    await page.goto(`/e/${event.short_code}`);

    // Bug réel signalé par Thomas : la checklist "Bien rentrés" listait TOUS
    // les participants (coche optionnelle), donnant l'impression trompeuse
    // que Marc était "bien rentré" alors qu'il n'a pas encore cliqué --
    // avant tout clic, cette section ne doit même pas apparaître.
    await expect(page.getByText("Bien rentrés")).not.toBeVisible();

    // Marc dit "bien rentré" -- visible de TOUT LE MONDE (retour Thomas),
    // pas seulement d'un admin : l'hôte doit voir sa coche dans la checklist
    // partagée, sans être admin d'un côté et guest de l'autre.
    await marcPage.getByRole("button", { name: "Je suis bien rentré" }).click();
    await expect(marcPage.getByRole("button", { name: "Bien rentré !" })).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("arrived_home_at").eq("id", marcRsvp!.id).single();
        return data?.arrived_home_at;
      })
      .not.toBeNull();

    await page.goto(`/e/${event.short_code}`);
    // "Marc" apparaît aussi dans la liste des arrivés (admin) plus haut sur
    // la carte : la checklist "bien rentré" est la dernière occurrence.
    const marcChecklistRow = page.getByText("Marc").last().locator("..");
    await expect(marcChecklistRow.getByText("✓")).toBeVisible({ timeout: 10_000 });

    // Les deux boutons sont re-cliquables pour annuler une erreur (retour
    // Thomas : "on doit pouvoir cliquer dessus et recliquer si on a fait une
    // erreur") -- reclique = décoché, pas figé une fois validé.
    await marcPage.getByRole("button", { name: "Bien rentré !" }).click();
    await expect(marcPage.getByRole("button", { name: "Je suis bien rentré" })).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("arrived_home_at").eq("id", marcRsvp!.id).single();
        return data?.arrived_home_at;
      })
      .toBeNull();
    await page.goto(`/e/${event.short_code}`);
    // Marc est retiré de la checklist "bien rentré" (pas juste décoché --
    // même bug que plus haut : la section entière disparaît puisque plus
    // personne n'est confirmé "bien rentré"). Il reste dans la liste des
    // arrivés (admin), toujours "arrivé" à ce stade.
    await expect(page.getByText("Bien rentrés")).not.toBeVisible();

    await marcPage.getByRole("button", { name: "Arrivé !" }).click();
    await expect(marcPage.getByRole("button", { name: "Je suis arrivé !" })).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("rsvps").select("checked_in_at").eq("id", marcRsvp!.id).single();
        return data?.checked_in_at;
      })
      .toBeNull();

    await marcContext.close();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    if (marcId) await deleteTestUser(marcId);
    await deleteTestUser(host.id);
  }
});

// Bug réel signalé par Thomas : une carte "Terminé" (mascotte FINISH)
// remplaçait entièrement la carte Jour J dès le lendemain civil de la fête,
// donc pour une fête qui déborde après minuit, la vue arrivées/checklist
// "bien rentré" disparaissait pile quand elle sert encore. Retirée puis
// réintroduite avec un vrai déclencheur (bouton "Terminer", voir le test
// suivant) -- entre-temps, le Mode Jour J a été prolongé à 2 jours de grâce
// après le début (retour Thomas : "met 2 jours de grâce"), et le badge
// "Terminé" près du titre ne s'affiche jamais en même temps que la carte
// Jour J.
test("le Mode Jour J reste actif 2 jours après le début (fête qui déborde après minuit), et l'Accueil bascule sur la carte Terminé au-delà", async ({
  page,
}) => {
  const hostEmail = `e2e-jourj-finished-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Fete terminee ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 10, 1000 Bruxelles");
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

    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      d.setHours(18, 0, 0, 0);
      return d.toISOString();
    };

    // Bascule sur AVANT-HIER (2 jours de grâce) : toujours en Mode Jour J --
    // et PAS de badge "Terminé" tant que ce mode est encore actif (retour
    // Thomas : "il faut enlever le terminé dans la bannière aussi non ?",
    // contradictoire d'afficher "Terminé" alors que la carte Jour J est
    // encore utile).
    await supabaseAdmin.from("events").update({ starts_at: daysAgo(2) }).eq("id", eventId);

    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText("C'est le jour J !")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Terminé", { exact: true })).not.toBeVisible();

    // Bascule à 3 jours : le Mode Jour J s'arrête, bascule automatique sur
    // la carte "Terminé" (mascotte FINISH).
    await supabaseAdmin.from("events").update({ starts_at: daysAgo(3) }).eq("id", eventId);

    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText(`Merci d'être venus à ${title} !`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Terminé", { exact: true })).toBeVisible();
    await expect(page.getByText("C'est le jour J !")).not.toBeVisible();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
  }
});

// Bouton "Terminer" (brief 4.11, proposé par Thomas) : un admin clôt le Mode
// Jour J manuellement, sans attendre la bascule automatique. Retour Thomas
// pendant la discussion : le bloc "Rentrer"/"bien rentré" (`GoHomeCard`) doit
// rester utilisable même une fois "Terminer" cliqué ("les gens qui rentrent
// chez eux" ne doivent jamais disparaître), et "Participer" (qui apporte
// quoi/sondages) doit devenir lecture seule.
test("bouton Terminer (admin) : bascule immédiate sur la carte Terminé, bloc Rentrer/bien-rentré toujours utilisable, Participer en lecture seule, Rouvrir revient au Mode Jour J", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const hostEmail = `e2e-jourj-end-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Fete a terminer ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 11, 1000 Bruxelles");
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

    await supabaseAdmin.from("events").update({ starts_at: todayAt(18) }).eq("id", eventId);

    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText("C'est le jour J !")).toBeVisible({ timeout: 10_000 });
    // Retour Thomas : "le bouton terminer doit être visible qu'à partir du
    // moment où en mode jour J" -- présent ici, tout en bas de la page.
    const endButton = page.getByRole("button", { name: "Terminer l'événement" });
    await expect(endButton).toBeVisible();

    await endButton.click();
    await expect(page.getByText(`Merci d'être venus à ${title} !`)).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("events").select("ended_at").eq("id", eventId!).single();
        return data?.ended_at;
      })
      .not.toBeNull();

    // Le bloc "Rentrer"/"bien rentré" reste affiché et utilisable une fois
    // "Terminer" cliqué (retour Thomas : ne doit jamais disparaître).
    await expect(page.getByText("Pour rentrer ce soir")).toBeVisible();
    await expect(page.getByRole("link", { name: "Bolt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Je suis bien rentré" })).toBeVisible();

    // Bug réel signalé par Thomas sur son propre événement "Terminé" : "j'ai
    // eu bien rentré mais dans personnes je ne vois pas... avec un v vert."
    // Le badge Personnes doit rester visible même une fois l'événement
    // Terminé, comme GoHomeCard.
    await page.getByRole("button", { name: "Je suis bien rentré" }).click();
    await expect(page.getByRole("button", { name: "Bien rentré !" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Personnes" }).click();
    await expect(page.getByText("✓ Bien rentré")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Accueil" }).click();

    // Participer bascule en lecture seule : plus de bouton d'ajout admin
    // ("+ Ajouter un item", seul bouton bring visible pour un admin -- voir
    // BringListClient.tsx, retour Thomas "pour les admin il faut juste un
    // seul bouton").
    await page.getByRole("button", { name: "Participer" }).click();
    await page.getByRole("button", { name: "À apporter" }).click();
    await expect(page.getByRole("button", { name: "+ Ajouter un item" })).not.toBeVisible();

    // "Rouvrir" (admin) annule le clic accidentel, retour au Mode Jour J.
    await page.getByRole("button", { name: "Accueil" }).click();
    await page.getByRole("button", { name: "Rouvrir" }).click();
    await expect(page.getByText("C'est le jour J !")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => {
        const { data } = await supabaseAdmin.from("events").select("ended_at").eq("id", eventId!).single();
        return data?.ended_at;
      })
      .toBeNull();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
  }
});

// Festival multi-jours (retour Thomas : "mais si c'est un festival qui dure 5
// jours, il va se terminer avant la fin ?") -- `endsAt` (champ "Heure de fin"
// du wizard) ancre la vraie durée du Mode Jour J, pas seulement
// `startsAt + 2 jours`.
test("un événement avec une heure de fin plusieurs jours après le début reste en Mode Jour J tout du long", async ({
  page,
}) => {
  const hostEmail = `e2e-jourj-festival-${Date.now()}@example.com`;
  const host = await loginAs(page, hostEmail);
  let eventId: string | null = null;

  try {
    const title = `Festival ${Date.now()}`;
    await page.getByRole("link", { name: "Créer un événement" }).click();
    await page.getByPlaceholder("L'anniversaire de Julie").fill(title);
    await page.locator('input[type="datetime-local"]').first().fill("2026-12-24T20:00");
    await page.getByPlaceholder("Adresse et ville").fill("Rue de Test 12, 1000 Bruxelles");
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

    // Le festival a commencé il y a 4 jours et se termine aujourd'hui --
    // sans `ends_at`, ce serait "Terminé" depuis longtemps (grâce de 2 jours
    // seulement après le DÉBUT).
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    fourDaysAgo.setHours(10, 0, 0, 0);
    await supabaseAdmin
      .from("events")
      .update({ starts_at: fourDaysAgo.toISOString(), ends_at: todayAt(23) })
      .eq("id", eventId);

    await page.goto(`/e/${event.short_code}`);
    await expect(page.getByText("C'est le jour J !")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Terminé", { exact: true })).not.toBeVisible();
  } finally {
    if (eventId) await supabaseAdmin.from("events").delete().eq("id", eventId);
    await deleteTestUser(host.id);
  }
});
