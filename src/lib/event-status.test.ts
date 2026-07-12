import { describe, expect, it } from "vitest";
import { isEventFinished, isEventOver, isJourJ, sortEventsByDate } from "./event-status";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

describe("isEventFinished", () => {
  it("n'est pas terminé le jour même, même si l'heure est déjà passée", () => {
    // `isEventFinished` ne compare que des dates civiles (voir son
    // commentaire), l'heure exacte n'a donc aucune importance ici -- construit
    // à partir d'AUJOURD'HUI plutôt que "maintenant moins 1h" : cette
    // dernière approche traverse minuit (et retombe donc sur HIER) si le test
    // tourne entre 00h00 et 01h00, un flake réel rencontré en exécutant la
    // suite après le passage de minuit.
    const earlierToday = new Date();
    earlierToday.setHours(9, 0, 0, 0);
    expect(isEventFinished(earlierToday.toISOString(), "fixed")).toBe(false);
  });

  it("est terminé à partir du lendemain", () => {
    expect(isEventFinished(isoDaysFromNow(-1), "fixed")).toBe(true);
  });

  it("n'est jamais terminé en mode sondage (pas de date fixée)", () => {
    expect(isEventFinished(null, "poll")).toBe(false);
  });
});

describe("isJourJ", () => {
  it("est vrai le jour même, peu importe l'heure (confirmé avec Thomas : pas de bascule selon l'heure)", () => {
    const earlyMorning = new Date();
    earlyMorning.setHours(1, 0, 0, 0);
    const lateNight = new Date();
    lateNight.setHours(23, 30, 0, 0);
    expect(isJourJ(earlyMorning.toISOString(), "fixed")).toBe(true);
    expect(isJourJ(lateNight.toISOString(), "fixed")).toBe(true);
  });

  it("reste vrai jusqu'à 2 jours de grâce après le début (retour Thomas : le temps de rentrer chez soi sans course contre la montre)", () => {
    expect(isJourJ(isoDaysFromNow(-1), "fixed")).toBe(true);
    expect(isJourJ(isoDaysFromNow(-2), "fixed")).toBe(true);
  });

  it("est faux la veille et au-delà des 2 jours de grâce", () => {
    expect(isJourJ(isoDaysFromNow(1), "fixed")).toBe(false);
    expect(isJourJ(isoDaysFromNow(-3), "fixed")).toBe(false);
  });

  it("n'est jamais vrai en mode sondage (pas de date fixée)", () => {
    expect(isJourJ(null, "poll")).toBe(false);
  });

  it("reste actif tout un festival multi-jours grâce à endsAt -- bug réel signalé par Thomas : \"si c'est un festival qui dure 5 jours, il va se terminer avant la fin ?\"", () => {
    const startsAt = isoDaysFromNow(-4);
    const endsAt = isoDaysFromNow(0);
    // Sans endsAt, le jour -4 serait déjà largement hors de la fenêtre
    // (jour + 2 jours de grâce seulement) -- avec endsAt, la fenêtre suit la
    // vraie durée de l'événement.
    expect(isJourJ(startsAt, "fixed", null)).toBe(false);
    expect(isJourJ(startsAt, "fixed", endsAt)).toBe(true);
    // Grâce de 2 jours après la FIN, pas après le début.
    expect(isJourJ(startsAt, "fixed", isoDaysFromNow(-2))).toBe(true);
    expect(isJourJ(startsAt, "fixed", isoDaysFromNow(-3))).toBe(false);
  });

  it("endedAt (bouton Terminer) prime sur tout calcul de date : faux même en pleine fenêtre Jour J", () => {
    expect(isJourJ(isoDaysFromNow(0), "fixed", null, isoDaysFromNow(0))).toBe(false);
  });
});

describe("isEventOver", () => {
  it("est faux pendant toute la fenêtre Jour J (jour même, grâce, festival)", () => {
    expect(isEventOver(isoDaysFromNow(0), "fixed")).toBe(false);
    expect(isEventOver(isoDaysFromNow(-2), "fixed")).toBe(false);
  });

  it("est vrai au-delà de la fenêtre Jour J", () => {
    expect(isEventOver(isoDaysFromNow(-3), "fixed")).toBe(true);
  });

  it("endedAt (bouton Terminer, retour Thomas) force Terminé même en pleine fenêtre Jour J", () => {
    expect(isEventOver(isoDaysFromNow(0), "fixed", null, isoDaysFromNow(0))).toBe(true);
  });

  it("respecte endsAt pour un événement multi-jours, jamais terminé avant sa vraie fin", () => {
    const startsAt = isoDaysFromNow(-4);
    const endsAt = isoDaysFromNow(0);
    expect(isEventOver(startsAt, "fixed", endsAt)).toBe(false);
  });
});

describe("sortEventsByDate", () => {
  it("ne fait jamais remonter un événement terminé au-dessus d'un événement en cours sans date (sondage)", () => {
    // Bug réel corrigé le 2026-07-06 : le tri vérifiait la date manquante
    // avant le statut terminé, poussant à tort un sondage en cours après un
    // événement déjà terminé.
    const finished = { starts_at: isoDaysFromNow(-10), date_mode: "fixed" };
    const ongoingPoll = { starts_at: null, date_mode: "poll" };

    const sorted = sortEventsByDate([finished, ongoingPoll]);
    expect(sorted).toEqual([ongoingPoll, finished]);
  });

  it("trie : à venir (le plus proche en premier) puis terminés (le plus récent en premier)", () => {
    const soonUpcoming = { starts_at: isoDaysFromNow(2), date_mode: "fixed" };
    const laterUpcoming = { starts_at: isoDaysFromNow(20), date_mode: "fixed" };
    const recentlyFinished = { starts_at: isoDaysFromNow(-5), date_mode: "fixed" };
    const longFinished = { starts_at: isoDaysFromNow(-30), date_mode: "fixed" };

    const sorted = sortEventsByDate([longFinished, laterUpcoming, recentlyFinished, soonUpcoming]);

    expect(sorted).toEqual([soonUpcoming, laterUpcoming, recentlyFinished, longFinished]);
  });

  it("place les événements en cours sans date (sondage) après ceux qui ont une date, dans le groupe en cours", () => {
    const upcoming = { starts_at: isoDaysFromNow(5), date_mode: "fixed" };
    const ongoingPoll = { starts_at: null, date_mode: "poll" };

    const sorted = sortEventsByDate([ongoingPoll, upcoming]);
    expect(sorted).toEqual([upcoming, ongoingPoll]);
  });

  it("un événement Terminé manuellement (ended_at) se trie comme terminé, même en pleine fenêtre Jour J", () => {
    const manuallyEnded = { starts_at: isoDaysFromNow(0), date_mode: "fixed", ended_at: isoDaysFromNow(0) };
    const upcoming = { starts_at: isoDaysFromNow(5), date_mode: "fixed" };

    const sorted = sortEventsByDate([manuallyEnded, upcoming]);
    expect(sorted).toEqual([upcoming, manuallyEnded]);
  });
});
