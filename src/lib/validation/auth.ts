import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});
