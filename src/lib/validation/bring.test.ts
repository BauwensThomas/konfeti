import { describe, expect, it } from "vitest";
import {
  claimBringItemSchema,
  itemIdSchema,
  mergeBringItemProposalSchema,
  proposeBringItemSchema,
  toggleBringBroughtSchema,
  updateBringItemQuantitySchema,
} from "./bring";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const otherUuid = "223e4567-e89b-12d3-a456-426614174000";

describe("claimBringItemSchema", () => {
  it("accepte une quantité positive", () => {
    const result = claimBringItemSchema.safeParse({ itemId: uuid, quantity: 2 });
    expect(result.success).toBe(true);
  });

  it("rejette une quantité nulle ou négative", () => {
    expect(claimBringItemSchema.safeParse({ itemId: uuid, quantity: 0 }).success).toBe(false);
    expect(claimBringItemSchema.safeParse({ itemId: uuid, quantity: -1 }).success).toBe(false);
  });

  it("rejette un itemId qui n'est pas un uuid", () => {
    expect(claimBringItemSchema.safeParse({ itemId: "pas-un-uuid", quantity: 1 }).success).toBe(false);
  });
});

describe("itemIdSchema", () => {
  it("accepte un uuid valide", () => {
    expect(itemIdSchema.safeParse({ itemId: uuid }).success).toBe(true);
  });

  it("rejette une valeur manquante", () => {
    expect(itemIdSchema.safeParse({}).success).toBe(false);
  });
});

describe("toggleBringBroughtSchema", () => {
  it("accepte un booléen", () => {
    expect(toggleBringBroughtSchema.safeParse({ claimId: uuid, brought: true }).success).toBe(true);
  });

  it("rejette une valeur non booléenne", () => {
    expect(toggleBringBroughtSchema.safeParse({ claimId: uuid, brought: "oui" }).success).toBe(false);
  });
});

describe("proposeBringItemSchema", () => {
  it("accepte une proposition valide", () => {
    const result = proposeBringItemSchema.safeParse({
      label: "Glaçons",
      unit: "kilogram",
      quantityNeeded: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejette un libellé vide", () => {
    expect(
      proposeBringItemSchema.safeParse({ label: "   ", unit: "piece", quantityNeeded: 1 }).success,
    ).toBe(false);
  });

  it("rejette une unité inconnue", () => {
    expect(
      proposeBringItemSchema.safeParse({ label: "Glaçons", unit: "tonne", quantityNeeded: 1 }).success,
    ).toBe(false);
  });

  it("rejette une quantité négative", () => {
    expect(
      proposeBringItemSchema.safeParse({ label: "Glaçons", unit: "piece", quantityNeeded: -1 }).success,
    ).toBe(false);
  });
});

describe("updateBringItemQuantitySchema", () => {
  it("accepte une quantité positive", () => {
    expect(updateBringItemQuantitySchema.safeParse({ itemId: uuid, quantityNeeded: 5 }).success).toBe(true);
  });

  it("rejette une quantité nulle", () => {
    expect(updateBringItemQuantitySchema.safeParse({ itemId: uuid, quantityNeeded: 0 }).success).toBe(false);
  });
});

describe("mergeBringItemProposalSchema", () => {
  it("accepte deux uuid distincts", () => {
    const result = mergeBringItemProposalSchema.safeParse({
      pendingItemId: uuid,
      targetItemId: otherUuid,
    });
    expect(result.success).toBe(true);
  });

  it("rejette un pendingItemId manquant", () => {
    expect(mergeBringItemProposalSchema.safeParse({ targetItemId: otherUuid }).success).toBe(false);
  });
});
