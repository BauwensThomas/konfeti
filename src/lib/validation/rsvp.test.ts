import { describe, expect, it } from "vitest";
import { rsvpIdentitySchema } from "./rsvp";

const VALID_INPUT = {
  firstName: "Julie",
  lastName: "Dean",
  phone: "+32 470 00 00 00",
  gender: "female",
  avatarKind: "preset",
  avatarValue: "avatar-1",
  answer: "yes",
  companions: [],
};

describe("rsvpIdentitySchema", () => {
  it("accepte une identité complète valide", () => {
    const result = rsvpIdentitySchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it("rejette un prénom vide", () => {
    const result = rsvpIdentitySchema.safeParse({ ...VALID_INPUT, firstName: "  " });
    expect(result.success).toBe(false);
  });

  it("rejette un téléphone invalide", () => {
    const result = rsvpIdentitySchema.safeParse({ ...VALID_INPUT, phone: "pas un numero" });
    expect(result.success).toBe(false);
  });

  it("rejette une réponse hors énumération", () => {
    const result = rsvpIdentitySchema.safeParse({ ...VALID_INPUT, answer: "peut-etre-mais-non" });
    expect(result.success).toBe(false);
  });

  it("accepte des accompagnants avec prénom optionnel", () => {
    const result = rsvpIdentitySchema.safeParse({
      ...VALID_INPUT,
      companions: [{ kind: "partner" }, { kind: "child", firstName: "Léo" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejette un type d'accompagnant inconnu", () => {
    const result = rsvpIdentitySchema.safeParse({
      ...VALID_INPUT,
      companions: [{ kind: "collegue" }],
    });
    expect(result.success).toBe(false);
  });
});
