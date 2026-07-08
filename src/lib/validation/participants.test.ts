import { describe, expect, it } from "vitest";
import {
  rsvpIdSchema,
  approveRsvpSchema,
  setParticipantRoleSchema,
  updateMyAnswerSchema,
} from "./participants";

describe("rsvpIdSchema", () => {
  it("accepte un uuid valide", () => {
    expect(rsvpIdSchema.safeParse({ rsvpId: crypto.randomUUID() }).success).toBe(true);
  });

  it("rejette un id qui n'est pas un uuid", () => {
    expect(rsvpIdSchema.safeParse({ rsvpId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("approveRsvpSchema", () => {
  it("accepte guest et beneficiary", () => {
    const id = crypto.randomUUID();
    expect(approveRsvpSchema.safeParse({ rsvpId: id, role: "guest" }).success).toBe(true);
    expect(approveRsvpSchema.safeParse({ rsvpId: id, role: "beneficiary" }).success).toBe(true);
  });

  it("rejette le role admin (promotion separee, pas via l'approbation)", () => {
    expect(
      approveRsvpSchema.safeParse({ rsvpId: crypto.randomUUID(), role: "admin" }).success,
    ).toBe(false);
  });
});

describe("setParticipantRoleSchema", () => {
  it("accepte les 3 roles", () => {
    const id = crypto.randomUUID();
    for (const role of ["guest", "admin", "beneficiary"]) {
      expect(setParticipantRoleSchema.safeParse({ rsvpId: id, role }).success).toBe(true);
    }
  });

  it("rejette un role invalide", () => {
    expect(
      setParticipantRoleSchema.safeParse({ rsvpId: crypto.randomUUID(), role: "host" }).success,
    ).toBe(false);
  });
});

describe("updateMyAnswerSchema", () => {
  it("accepte yes, maybe et no", () => {
    const id = crypto.randomUUID();
    for (const answer of ["yes", "maybe", "no"]) {
      expect(updateMyAnswerSchema.safeParse({ rsvpId: id, answer }).success).toBe(true);
    }
  });

  it("rejette une reponse invalide", () => {
    expect(
      updateMyAnswerSchema.safeParse({ rsvpId: crypto.randomUUID(), answer: "peut-etre" }).success,
    ).toBe(false);
  });
});
