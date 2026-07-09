"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  sendMagicLink,
  signInWithGoogle,
  type MagicLinkResult,
} from "@/app/[locale]/actions/auth";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const t = useTranslations("Login");
  const [state, formAction, isPending] = useActionState<MagicLinkResult | null, FormData>(
    sendMagicLink,
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
    <div className="flex w-full max-w-sm flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        <div>
          <label htmlFor="login-email" className="sr-only">
            {t("emailLabel")}
          </label>
          <input
            id="login-email"
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
                : state.error === "email_taken"
                  ? t("errorEmailTaken")
                  : t("errorUnknown")}
            </p>
          )}
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("submitting") : t("submit")}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-sm text-foreground/50">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogle}>
        <Button type="submit" variant="secondary" className="w-full">
          {t("google")}
        </Button>
      </form>
    </div>
  );
}
