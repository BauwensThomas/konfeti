"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileCompletionSchema, type ProfileCompletionInput } from "@/lib/validation/profile";

export type ProfileCompletionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "unknown" | "not_authenticated" };

export async function completeProfile(
  input: ProfileCompletionInput,
  next: string,
): Promise<ProfileCompletionResult> {
  const parsed = profileCompletionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone,
      gender: parsed.data.gender,
      avatar_kind: parsed.data.avatarKind,
      avatar_value: parsed.data.avatarValue ?? null,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  redirect(next || "/mes-evenements");
}
