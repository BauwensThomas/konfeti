"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { joinWaitlist, type WaitlistResult } from "@/app/[locale]/actions/waitlist";
import { Button } from "@/components/ui/Button";

export function WaitlistForm() {
  const t = useTranslations("Waitlist");
  const [state, formAction, isPending] = useActionState<WaitlistResult | null, FormData>(
    joinWaitlist,
    null,
  );

  if (state?.ok) {
    return (
      <p
        role="status"
        className="rounded-konfeti bg-accent-mint/20 px-6 py-4 font-display text-lg text-foreground"
      >
        {t("success")}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex-1">
        <label htmlFor="waitlist-email" className="sr-only">
          {t("emailLabel")}
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          className="w-full rounded-full border border-border bg-surface px-5 py-3 text-base text-foreground placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        {state?.ok === false && (
          <p role="alert" className="mt-2 px-2 text-sm text-accent-coral">
            {state.error === "invalid_email"
              ? t("errorInvalidEmail")
              : state.error === "rate_limited"
                ? t("errorRateLimited")
                : t("errorUnknown")}
          </p>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
