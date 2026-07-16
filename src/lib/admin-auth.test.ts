import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSessionCookieValue, verifySessionCookieValue } from "./admin-auth";

describe("admin-auth : cookie de session signé", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-do-not-use-in-prod");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepte un cookie fraîchement créé", () => {
    const now = new Date("2026-07-16T10:00:00Z");
    const value = createSessionCookieValue(now);
    expect(verifySessionCookieValue(value, now)).toBe(true);
  });

  it("accepte un cookie encore valide juste avant expiration", () => {
    const now = new Date("2026-07-16T10:00:00Z");
    const value = createSessionCookieValue(now);
    const almostExpired = new Date(now.getTime() + 12 * 60 * 60 * 1000 - 1000);
    expect(verifySessionCookieValue(value, almostExpired)).toBe(true);
  });

  it("refuse un cookie expiré", () => {
    const now = new Date("2026-07-16T10:00:00Z");
    const value = createSessionCookieValue(now);
    const later = new Date(now.getTime() + 12 * 60 * 60 * 1000 + 1000);
    expect(verifySessionCookieValue(value, later)).toBe(false);
  });

  it("refuse une signature falsifiée", () => {
    const now = new Date("2026-07-16T10:00:00Z");
    const value = createSessionCookieValue(now);
    const [expiresAt] = value.split(".");
    const tampered = `${expiresAt}.0000000000000000000000000000000000000000000000000000000000000000`;
    expect(verifySessionCookieValue(tampered, now)).toBe(false);
  });

  it("refuse une expiration falsifiée (signature ne correspond plus)", () => {
    const now = new Date("2026-07-16T10:00:00Z");
    const value = createSessionCookieValue(now);
    const [, signature] = value.split(".");
    const farFuture = now.getTime() + 1000 * 60 * 60 * 24 * 365;
    const tampered = `${farFuture}.${signature}`;
    expect(verifySessionCookieValue(tampered, now)).toBe(false);
  });

  it("refuse une valeur vide, nulle ou malformée", () => {
    const now = new Date("2026-07-16T10:00:00Z");
    expect(verifySessionCookieValue(null, now)).toBe(false);
    expect(verifySessionCookieValue(undefined, now)).toBe(false);
    expect(verifySessionCookieValue("", now)).toBe(false);
    expect(verifySessionCookieValue("n'importe quoi", now)).toBe(false);
  });

  it("un cookie signé avec un secret différent est refusé", () => {
    const now = new Date("2026-07-16T10:00:00Z");
    const value = createSessionCookieValue(now);
    vi.stubEnv("ADMIN_SESSION_SECRET", "un-autre-secret");
    expect(verifySessionCookieValue(value, now)).toBe(false);
  });
});
