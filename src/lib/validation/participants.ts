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
