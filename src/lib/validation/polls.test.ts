import { describe, expect, it } from "vitest";
import { pollIdSchema, proposePollSchema, voteOptionSchema } from "./polls";

const uuid = "123e4567-e89b-12d3-a456-426614174000";

describe("voteOptionSchema", () => {
  it("accepte un vote coché ou décoché", () => {
    expect(voteOptionSchema.safeParse({ optionId: uuid, checked: true }).success).toBe(true);
    expect(voteOptionSchema.safeParse({ optionId: uuid, checked: false }).success).toBe(true);
  });

  it("rejette un optionId qui n'est pas un uuid", () => {
    expect(voteOptionSchema.safeParse({ optionId: "pas-un-uuid", checked: true }).success).toBe(false);
  });

  it("rejette une valeur checked non booléenne", () => {
    expect(voteOptionSchema.safeParse({ optionId: uuid, checked: "oui" }).success).toBe(false);
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
