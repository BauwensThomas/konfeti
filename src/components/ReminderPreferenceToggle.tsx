"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateReminderPreference } from "@/app/[locale]/actions/profile";
import { notifySessionExpired } from "@/lib/session-expired";

// Réglage global "recevoir des rappels par email" (retour Thomas : "dans le
// profil il faut pouvoir cocher ou décocher de recevoir les mails") --
// bascule immédiate au clic (même geste que `wants_pot_access` ailleurs),
// pas de bouton "Enregistrer" séparé.
export function ReminderPreferenceToggle({ initialValue }: { initialValue: boolean }) {
  const t = useTranslations("ProfileCompletion");
  const [checked, setChecked] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      const result = await updateReminderPreference(next);
      if (!result.ok) {
        setChecked(!next);
        if (result.error === "not_authenticated") {
          notifySessionExpired();
        } else {
          setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
        }
      }
    });
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2 border-t border-border pt-8">
      <label className="flex items-center gap-2 text-left text-sm text-foreground">
        <input
          type="checkbox"
          checked={checked}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.checked)}
        />
        {t("reminderPreferenceLabel")}
      </label>
      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}
    </div>
  );
}
