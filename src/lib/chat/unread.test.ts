import { describe, expect, it } from "vitest";
import { computeUnreadCount } from "./unread";

describe("computeUnreadCount", () => {
  it("retourne 0 sans message", () => {
    expect(computeUnreadCount([], "r1")).toBe(0);
  });

  it("exclut les messages envoyés par le viewer lui-même", () => {
    expect(computeUnreadCount([{ rsvpId: "r1" }], "r1")).toBe(0);
  });

  it("compte les messages des autres", () => {
    expect(computeUnreadCount([{ rsvpId: "r2" }], "r1")).toBe(1);
  });

  it("mélange messages du viewer et des autres, ne compte que les autres", () => {
    expect(computeUnreadCount([{ rsvpId: "r1" }, { rsvpId: "r2" }, { rsvpId: null }], "r1")).toBe(2);
  });

  it("viewerRsvpId null (hôte sans ligne rsvps) : tout compte", () => {
    expect(computeUnreadCount([{ rsvpId: "r2" }, { rsvpId: "r3" }], null)).toBe(2);
  });
});
