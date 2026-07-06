"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { profileCompletionSchema } from "@/lib/validation/profile";

export type ProfileCompletionResult = {
  ok: false;
  error: "invalid" | "unknown" | "not_authenticated";
} | null;

export async function completeProfile(
  _prevState: ProfileCompletionResult,
  formData: FormData,
): Promise<ProfileCompletionResult> {
  const parsed = profileCompletionSchema.safeParse({
    phone: formData.get("phone"),
    gender: formData.get("gender"),
  });

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
    .update({ phone: parsed.data.phone, gender: parsed.data.gender })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: "unknown" };
  }

  const next = formData.get("next");
  redirect(typeof next === "string" && next ? next : "/mes-evenements");
}
