import { z } from "zod";

export const profileCompletionSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(6, "phone_too_short")
    .regex(/^[+0-9 ()-]+$/, "phone_invalid"),
  gender: z.enum(["female", "male"]),
});
