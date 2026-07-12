import { describe, expect, it } from "vitest";
import { createEventSchema, updateEventSchema } from "./event";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
// Pas `new Date().toISOString().slice(0, 10)` : une chaîne date-only se
// compare en heure LOCALE côté validation (`parseDateOnlyLocal`), alors que
// `toISOString()` convertit en UTC -- au tout début de la journée locale
// (Belgique, UTC+2 l'été), cette conversion peut faire "reculer" d'un jour et
// casser ce test selon l'heure exacte d'exécution (flake réel rencontré).
const todayDateOnlyLocal = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: "Fete de test",
    theme: "confetti",
    dateMode: "fixed" as const,
    startsAt: isoDaysFromNow(7),
    locationText: "Rue de Test 1, 1000 Bruxelles",
    occasion: "other" as const,
    ...overrides,
  };
}

describe("createEventSchema", () => {
  it("accepte une date future", () => {
    expect(createEventSchema.safeParse(baseInput()).success).toBe(true);
  });

  it("rejette une date de debut dans le passe", () => {
    const result = createEventSchema.safeParse(baseInput({ startsAt: isoDaysFromNow(-1) }));
    expect(result.success).toBe(false);
  });

  // Bug reel signale par Thomas : "j'ai reussi a mettre la date limite aussi
  // avant la date actuelle" -- rsvpDeadline n'etait comparee qu'a startsAt,
  // jamais a "maintenant".
  it("rejette une date limite de reponse dans le passe, meme si elle reste avant l'evenement", () => {
    const result = createEventSchema.safeParse(
      baseInput({ rsvpDeadline: isoDaysFromNow(-2).slice(0, 10) }),
    );
    expect(result.success).toBe(false);
  });

  it("accepte une date limite de reponse aujourd'hui (comparaison en date civile, pas en horodatage exact)", () => {
    const result = createEventSchema.safeParse(baseInput({ rsvpDeadline: todayDateOnlyLocal() }));
    expect(result.success).toBe(true);
  });

  it("rejette une date limite de reponse apres l'evenement", () => {
    const result = createEventSchema.safeParse(
      baseInput({ startsAt: isoDaysFromNow(2), rsvpDeadline: isoDaysFromNow(5).slice(0, 10) }),
    );
    expect(result.success).toBe(false);
  });
});

describe("updateEventSchema", () => {
  it("skipPastDateCheck=false (evenement pas encore passe) : rejette de faire reculer la date vers le passe", () => {
    // Bug reel corrige : ce drapeau valait `true` pour TOUTE edition avant,
    // ce qui permettait de faire reculer un evenement encore a venir.
    const result = updateEventSchema(false).safeParse(baseInput({ startsAt: isoDaysFromNow(-3) }));
    expect(result.success).toBe(false);
  });

  it("skipPastDateCheck=true (evenement deja passe) : autorise de corriger une coquille sur une date deja passee", () => {
    const result = updateEventSchema(true).safeParse(baseInput({ startsAt: isoDaysFromNow(-3) }));
    expect(result.success).toBe(true);
  });

  it("skipPastDateCheck=true : autorise aussi une date limite de reponse deja passee", () => {
    const result = updateEventSchema(true).safeParse(
      baseInput({
        startsAt: isoDaysFromNow(-3),
        rsvpDeadline: isoDaysFromNow(-5).slice(0, 10),
      }),
    );
    expect(result.success).toBe(true);
  });
});
