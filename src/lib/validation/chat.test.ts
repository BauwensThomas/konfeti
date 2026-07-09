import { describe, expect, it } from "vitest";
import {
  sendMessageSchema,
  editMessageSchema,
  moderateDeleteMessageSchema,
  setReactionSchema,
} from "./chat";

const eventId = crypto.randomUUID();
const rsvpId = crypto.randomUUID();

describe("sendMessageSchema", () => {
  it("accepte un message texte", () => {
    expect(
      sendMessageSchema.safeParse({ eventId, rsvpId, channel: "main", body: "Salut !" }).success,
    ).toBe(true);
  });

  it("accepte un message photo sans texte", () => {
    expect(
      sendMessageSchema.safeParse({ eventId, rsvpId, channel: "main", photoUrl: "user/messages/x.webp" })
        .success,
    ).toBe(true);
  });

  it("rejette un message totalement vide (ni body, ni photo)", () => {
    expect(sendMessageSchema.safeParse({ eventId, rsvpId, channel: "main" }).success).toBe(false);
  });

  it("accepte un replyTo optionnel", () => {
    expect(
      sendMessageSchema.safeParse({
        eventId,
        rsvpId,
        channel: "main",
        body: "Salut !",
        replyTo: crypto.randomUUID(),
      }).success,
    ).toBe(true);
  });

  it("rejette un canal invalide", () => {
    expect(
      sendMessageSchema.safeParse({ eventId, rsvpId, channel: "secret", body: "Salut !" }).success,
    ).toBe(false);
  });
});

describe("editMessageSchema", () => {
  it("accepte un texte non vide", () => {
    expect(
      editMessageSchema.safeParse({ messageId: crypto.randomUUID(), body: "Correction" }).success,
    ).toBe(true);
  });

  it("rejette un texte vide", () => {
    expect(editMessageSchema.safeParse({ messageId: crypto.randomUUID(), body: "" }).success).toBe(
      false,
    );
  });
});

describe("moderateDeleteMessageSchema", () => {
  it("accepte un uuid valide", () => {
    expect(moderateDeleteMessageSchema.safeParse({ messageId: crypto.randomUUID() }).success).toBe(
      true,
    );
  });

  it("rejette un id qui n'est pas un uuid", () => {
    expect(moderateDeleteMessageSchema.safeParse({ messageId: "abc" }).success).toBe(false);
  });
});

describe("setReactionSchema", () => {
  it("accepte un émoji valide", () => {
    expect(
      setReactionSchema.safeParse({ messageId: crypto.randomUUID(), emoji: "👍" }).success,
    ).toBe(true);
  });

  it("accepte emoji null (retrait de la réaction)", () => {
    expect(
      setReactionSchema.safeParse({ messageId: crypto.randomUUID(), emoji: null }).success,
    ).toBe(true);
  });

  it("rejette un émoji hors du registre", () => {
    expect(
      setReactionSchema.safeParse({ messageId: crypto.randomUUID(), emoji: "🍌" }).success,
    ).toBe(false);
  });
});
