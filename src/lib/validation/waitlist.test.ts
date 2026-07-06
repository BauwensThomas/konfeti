import { describe, expect, it } from "vitest";
import { waitlistSchema } from "./waitlist";

describe("waitlistSchema", () => {
  it("accepte un email valide et le normalise", () => {
    const result = waitlistSchema.safeParse({ email: "  Test@Example.com  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("test@example.com");
    }
  });

  it("rejette un email invalide", () => {
    const result = waitlistSchema.safeParse({ email: "pas-un-email" });
    expect(result.success).toBe(false);
  });

  it("rejette une valeur manquante", () => {
    const result = waitlistSchema.safeParse({ email: undefined });
    expect(result.success).toBe(false);
  });
});
