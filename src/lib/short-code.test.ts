import { describe, expect, it } from "vitest";
import { generateShortCode } from "./short-code";

describe("generateShortCode", () => {
  it("génère un code au format MOT-XXXXXXXX (8 caractères alphanumériques)", () => {
    expect(generateShortCode()).toMatch(/^[A-Z]+-[A-Z0-9]{8}$/);
  });

  it("génère des codes différents à chaque appel (entropie suffisante)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateShortCode()));
    expect(codes.size).toBe(20);
  });
});
