"use client";

import { useState, useTransition } from "react";
import { resendMagicLink } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

export function ResendMagicLinkForm() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    setMessage(null);
    startTransition(async () => {
      const result = await resendMagicLink(email);
      setMessage(result.ok ? "Lien envoyé." : "Échec de l'envoi, vérifie l'adresse.");
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        type="email"
        name="email"
        required
        placeholder="email@exemple.com"
        className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-foreground placeholder:text-foreground/50"
      />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Envoi..." : "Renvoyer un lien de connexion"}
      </Button>
      {message && <span className="text-sm text-foreground/70">{message}</span>}
    </form>
  );
}
