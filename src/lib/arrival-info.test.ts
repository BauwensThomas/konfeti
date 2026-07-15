import { describe, expect, it } from "vitest";
import { isAfterMidnightContext } from "./arrival-info";

function atHour(hour: number, minute = 0) {
  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return now;
}

describe("isAfterMidnightContext", () => {
  it("est faux juste avant minuit", () => {
    expect(isAfterMidnightContext(atHour(23, 59))).toBe(false);
  });

  it("est vrai pile minuit", () => {
    expect(isAfterMidnightContext(atHour(0, 0))).toBe(true);
  });

  it("reste vrai juste avant l'aube (5h59)", () => {
    expect(isAfterMidnightContext(atHour(5, 59))).toBe(true);
  });

  it("redevient faux à partir de 6h", () => {
    expect(isAfterMidnightContext(atHour(6, 0))).toBe(false);
  });

  it("est faux en pleine journée", () => {
    expect(isAfterMidnightContext(atHour(12, 0))).toBe(false);
  });
});
