import { describe, expect, it } from "vitest";
import { generateGuestCode, generateShortCode } from "./short-code";

describe("generateShortCode", () => {
  it("génère un code au format MOT-1234", () => {
    expect(generateShortCode()).toMatch(/^[A-Z]+-[0-9]{4}$/);
  });
});

describe("generateGuestCode", () => {
  it("génère un code au format MOT-1234", () => {
    expect(generateGuestCode()).toMatch(/^[A-Z]+-[0-9]{4}$/);
  });

  it("utilise des mots différents du code d'événement pour ne pas les confondre", () => {
    const guestCode = generateGuestCode();
    const word = guestCode.split("-")[0];
    expect(["FIESTA", "PARTY", "CONFETTI", "SOIREE", "FETE", "DISCO", "GALA", "BOOM"]).not.toContain(
      word,
    );
  });
});
