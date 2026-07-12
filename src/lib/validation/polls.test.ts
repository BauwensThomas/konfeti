import { describe, expect, it } from "vitest";
import { pollIdSchema, proposePollSchema, setPollVoteSchema } from "./polls";

const uuid = "123e4567-e89b-12d3-a456-426614174000";

describe("setPollVoteSchema", () => {
  it("accepte une quantité positive ou nulle (retrait du vote)", () => {
    expect(setPollVoteSchema.safeParse({ optionId: uuid, quantity: 3 }).success).toBe(true);
    expect(setPollVoteSchema.safeParse({ optionId: uuid, quantity: 0 }).success).toBe(true);
  });

  it("rejette un optionId qui n'est pas un uuid", () => {
    expect(setPollVoteSchema.safeParse({ optionId: "pas-un-uuid", quantity: 1 }).success).toBe(false);
  });

  it("rejette une quantité négative ou non entière", () => {
    expect(setPollVoteSchema.safeParse({ optionId: uuid, quantity: -1 }).success).toBe(false);
    expect(setPollVoteSchema.safeParse({ optionId: uuid, quantity: 1.5 }).success).toBe(false);
  });
});

describe("pollIdSchema", () => {
  it("accepte un uuid valide", () => {
    expect(pollIdSchema.safeParse({ pollId: uuid }).success).toBe(true);
  });

  it("rejette une valeur manquante", () => {
    expect(pollIdSchema.safeParse({}).success).toBe(false);
  });
});

describe("proposePollSchema", () => {
  it("accepte une proposition valide avec au moins 2 options", () => {
    const result = proposePollSchema.safeParse({
      question: "Quelle activité ?",
      options: [{ label: "Pétanque" }, { label: "Piscine" }],
    });
    expect(result.success).toBe(true);
  });

  it("défaut choiceMode à 'multiple' si absent", () => {
    const result = proposePollSchema.parse({
      question: "Quelle activité ?",
      options: [{ label: "Pétanque" }, { label: "Piscine" }],
    });
    expect(result.choiceMode).toBe("multiple");
  });

  it("accepte choiceMode 'single'", () => {
    const result = proposePollSchema.safeParse({
      question: "Quel menu ?",
      options: [{ label: "Moules-frites" }, { label: "Spaghetti" }],
      choiceMode: "single",
    });
    expect(result.success).toBe(true);
  });

  it("rejette une question vide", () => {
    expect(
      proposePollSchema.safeParse({
        question: "   ",
        options: [{ label: "Pétanque" }, { label: "Piscine" }],
      }).success,
    ).toBe(false);
  });

  it("rejette moins de 2 options", () => {
    expect(
      proposePollSchema.safeParse({ question: "Quelle activité ?", options: [{ label: "Pétanque" }] }).success,
    ).toBe(false);
  });

  it("rejette plus de 10 options", () => {
    const options = Array.from({ length: 11 }, (_, i) => ({ label: `Option ${i}` }));
    expect(proposePollSchema.safeParse({ question: "Quelle activité ?", options }).success).toBe(false);
  });
});
