"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { patchEvent } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

export function EventCorrectionForm({
  eventId,
  title,
  startsAt,
  cancelled,
}: {
  eventId: string;
  title: string;
  startsAt: string | null;
  cancelled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [titleValue, setTitleValue] = useState(title);
  const [startsAtValue, setStartsAtValue] = useState(startsAt ? startsAt.slice(0, 16) : "");
  const [cancelledValue, setCancelledValue] = useState(cancelled);

  function handleSubmit() {
    startTransition(async () => {
      await patchEvent({
        eventId,
        title: titleValue,
        startsAt: startsAtValue ? new Date(startsAtValue).toISOString() : undefined,
        cancelled: cancelledValue,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={titleValue}
        onChange={(e) => setTitleValue(e.target.value)}
        className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
      />
      <input
        type="datetime-local"
        value={startsAtValue}
        onChange={(e) => setStartsAtValue(e.target.value)}
        className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
      />
      <label className="flex items-center gap-1 text-sm text-foreground">
        <input type="checkbox" checked={cancelledValue} onChange={(e) => setCancelledValue(e.target.checked)} />
        Annulé
      </label>
      <Button size="sm" variant="secondary" disabled={isPending} onClick={handleSubmit}>
        {isPending ? "..." : "Enregistrer"}
      </Button>
    </div>
  );
}
