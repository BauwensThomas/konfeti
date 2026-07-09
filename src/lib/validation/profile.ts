import { z } from "zod";

export const profileCompletionSchema = z.object({
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
});
export type ProfileCompletionInput = z.infer<typeof profileCompletionSchema>;
