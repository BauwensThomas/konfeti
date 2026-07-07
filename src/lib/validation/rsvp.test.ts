import { describe, expect, it } from "vitest";
import { guestCodeSchema, rsvpIdentitySchema } from "./rsvp";

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

describe("guestCodeSchema", () => {
  it("accepte un code au bon format, insensible à la casse", () => {
    const result = guestCodeSchema.safeParse({ code: "invite-k3m9qz" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("INVITE-K3M9QZ");
    }
  });

  it("rejette un code mal formé", () => {
    const result = guestCodeSchema.safeParse({ code: "pasuncode" });
    expect(result.success).toBe(false);
  });

  it("rejette l'ancien format à 4 chiffres (entropie insuffisante, plus généré)", () => {
    const result = guestCodeSchema.safeParse({ code: "INVITE-4291" });
    expect(result.success).toBe(false);
  });
});
