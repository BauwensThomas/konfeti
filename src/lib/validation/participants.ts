import { z } from "zod";

export const rsvpIdSchema = z.object({
  rsvpId: z.string().uuid(),
});

export const approveRsvpSchema = z.object({
  rsvpId: z.string().uuid(),
  role: z.enum(["guest", "beneficiary"]),
});

export const setParticipantRoleSchema = z.object({
  rsvpId: z.string().uuid(),
  role: z.enum(["guest", "admin", "beneficiary"]),
});

export const updateMyAnswerSchema = z.object({
  rsvpId: z.string().uuid(),
  answer: z.enum(["yes", "maybe", "no"]),
});

export const transferEventHostSchema = z.object({
  eventId: z.string().uuid(),
  newHostProfileId: z.string().uuid(),
});

export const addCompanionSchema = z.object({
  rsvpId: z.string().uuid(),
  kind: z.enum(["partner", "child", "friend", "family"]),
  firstName: z.string().trim().max(80).optional(),
});

export const companionIdSchema = z.object({
  companionId: z.string().uuid(),
});
