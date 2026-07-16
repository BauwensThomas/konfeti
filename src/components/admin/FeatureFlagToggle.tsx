"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleFeatureFlag } from "@/app/admin/actions";

export function FeatureFlagToggle({ flagKey, enabled }: { flagKey: string; enabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        checked={enabled}
        disabled={isPending}
        onChange={(e) =>
          startTransition(async () => {
            await toggleFeatureFlag(flagKey, e.target.checked);
            router.refresh();
          })
        }
      />
      {enabled ? "Activé" : "Désactivé"}
    </label>
  );
}
