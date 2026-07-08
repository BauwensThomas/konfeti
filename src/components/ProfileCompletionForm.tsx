"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  completeProfile,
  type ProfileCompletionResult,
} from "@/app/[locale]/actions/profile";
import { Button } from "@/components/ui/Button";

export function ProfileCompletionForm({ next }: { next: string }) {
  const t = useTranslations("ProfileCompletion");
  const [state, formAction, isPending] = useActionState<ProfileCompletionResult, FormData>(
    completeProfile,
    null,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="phone" className="mb-1 block text-left text-sm font-semibold text-foreground">
          {t("phoneLabel")}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder={t("phonePlaceholder")}
          className="w-full rounded-full border border-border bg-surface px-5 py-3 text-base text-foreground placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-left text-sm font-semibold text-foreground">
          {t("genderLabel")}
        </legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-base text-foreground">
            <input type="radio" name="gender" value="female" required />
            {t("genderFemale")}
          </label>
          <label className="flex items-center gap-2 text-base text-foreground">
            <input type="radio" name="gender" value="male" required />
            {t("genderMale")}
          </label>
        </div>
      </fieldset>

      {state?.ok === false && (
        <p role="alert" className="text-sm text-accent-coral">
          {state.error === "invalid" ? t("errorInvalid") : t("errorUnknown")}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
