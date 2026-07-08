import { describe, expect, it } from "vitest";
import { isRateLimited } from "./rate-limit";

describe("isRateLimited", () => {
  it("autorise les appels tant que la limite n'est pas atteinte", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(isRateLimited(key, 3, 60_000)).toBe(false);
    expect(isRateLimited(key, 3, 60_000)).toBe(false);
    expect(isRateLimited(key, 3, 60_000)).toBe(false);
  });

  it("bloque une fois la limite dépassée", () => {
    const key = `test-${crypto.randomUUID()}`;
    isRateLimited(key, 2, 60_000);
    isRateLimited(key, 2, 60_000);
    expect(isRateLimited(key, 2, 60_000)).toBe(true);
  });

  it("des clés différentes ont des compteurs indépendants", () => {
    const keyA = `test-a-${crypto.randomUUID()}`;
    const keyB = `test-b-${crypto.randomUUID()}`;
    isRateLimited(keyA, 1, 60_000);
    expect(isRateLimited(keyA, 1, 60_000)).toBe(true);
    expect(isRateLimited(keyB, 1, 60_000)).toBe(false);
  });

  it("la fenêtre expire et réautorise ensuite", () => {
    const key = `test-${crypto.randomUUID()}`;
    expect(isRateLimited(key, 1, 10)).toBe(false);
    expect(isRateLimited(key, 1, 10)).toBe(true);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(isRateLimited(key, 1, 10)).toBe(false);
        resolve(undefined);
      }, 20);
    });
  });
});
