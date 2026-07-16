"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { unblockParticipantAdmin } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

export function UnblockButtonAdmin({ rsvpId }: { rsvpId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await unblockParticipantAdmin(rsvpId);
          router.refresh();
        })
      }
    >
      {isPending ? "..." : "Débloquer"}
    </Button>
  );
}
