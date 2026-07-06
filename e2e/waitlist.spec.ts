import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test("un visiteur peut s'inscrire à la waitlist", async ({ page }) => {
  const email = `e2e-waitlist-${Date.now()}@example.com`;

  await page.goto("/");
  await page.getByLabel("Ton adresse email").fill(email);
  await page.getByRole("button", { name: "Me prévenir" }).click();

  await expect(page.getByRole("status")).toBeVisible();

  const { data } = await supabase
    .from("waitlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  expect(data?.email).toBe(email);

  await supabase.from("waitlist").delete().eq("email", email);
});
