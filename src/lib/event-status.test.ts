import { describe, expect, it } from "vitest";
import { isEventFinished, sortEventsByDate } from "./event-status";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

describe("isEventFinished", () => {
  it("n'est pas terminé le jour même, même si l'heure est déjà passée", () => {
    const earlierToday = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(isEventFinished(earlierToday, "fixed")).toBe(false);
  });

  it("est terminé à partir du lendemain", () => {
    expect(isEventFinished(isoDaysFromNow(-1), "fixed")).toBe(true);
  });

  it("n'est jamais terminé en mode sondage (pas de date fixée)", () => {
    expect(isEventFinished(null, "poll")).toBe(false);
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
    const recentlyFinished = { starts_at: isoDaysFromNow(-2), date_mode: "fixed" };
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
});
