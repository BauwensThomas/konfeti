import { z } from "zod";

export const companionSchema = z.object({
  kind: z.enum(["partner", "child", "friend", "family"]),
  firstName: z.string().trim().max(80).optional(),
});

export const rsvpIdentitySchema = z.object({
  firstName: z.string().trim().min(1, "first_name_required").max(80),
  lastName: z.string().trim().min(1, "last_name_required").max(80),
  phone: z
    .string()
    .trim()
    .min(6, "phone_too_short")
    .regex(/^[+0-9 ()-]+$/, "phone_invalid"),
  gender: z.enum(["female", "male"]),
  avatarKind: z.enum(["preset", "photo"]),
  avatarValue: z.string().trim().min(1).optional(),
  answer: z.enum(["yes", "maybe", "no"]),
  companions: z.array(companionSchema).max(20).default([]),
});

export type RsvpIdentityInput = z.infer<typeof rsvpIdentitySchema>;

export const guestCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]+-[A-Z0-9]{6}$/, "guest_code_invalid"),
});
