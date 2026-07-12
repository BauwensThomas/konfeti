import { z } from "zod";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url().max(2000),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushCategorySchema = z.enum(["invitations", "chat", "organisation", "jourj"]);
export type PushCategoryInput = z.infer<typeof pushCategorySchema>;
