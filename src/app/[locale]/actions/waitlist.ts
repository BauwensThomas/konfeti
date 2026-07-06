"use server";

import { createClient } from "@/lib/supabase/server";
import { waitlistSchema } from "@/lib/validation/waitlist";

export type WaitlistResult =
  | { ok: true }
  | { ok: false; error: "invalid_email" | "unknown" };

export async function joinWaitlist(
  _prevState: WaitlistResult | null,
  formData: FormData,
): Promise<WaitlistResult> {
  const parsed = waitlistSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: "invalid_email" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("waitlist")
    .insert({ email: parsed.data.email });

  if (error && error.code !== "23505") {
    return { ok: false, error: "unknown" };
  }

  return { ok: true };
}
