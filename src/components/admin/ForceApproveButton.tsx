"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { forceApproveRsvp } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

export function ForceApproveButton({ rsvpId }: { rsvpId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await forceApproveRsvp(rsvpId);
          router.refresh();
        })
      }
    >
      {isPending ? "..." : "Forcer la validation"}
    </Button>
  );
}
