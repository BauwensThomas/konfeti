"use client";

import { useActionState } from "react";
import { adminLogin, type AdminLoginResult } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

// Back-office /admin (Phase 9) : formulaire mot de passe seul, jamais lié à
// Supabase Auth -- voir `lib/admin-auth.ts`. Message d'erreur générique
// (jamais "mot de passe incorrect" vs "trop de tentatives" en détail au-delà
// de ces deux cas, pour ne rien révéler d'utile à un attaquant).
export function AdminLoginForm() {
  const [state, formAction, isPending] = useActionState<AdminLoginResult | null, FormData>(adminLogin, null);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-3">
      <div>
        <label htmlFor="admin-password" className="sr-only">
          Mot de passe
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Mot de passe"
          className="w-full rounded-full border border-border bg-surface px-5 py-3 text-base text-foreground placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        {state?.ok === false && (
          <p role="alert" className="mt-2 px-2 text-sm text-accent-coral">
            {state.error === "rate_limited" ? "Trop de tentatives, réessaie dans un instant." : "Mot de passe incorrect."}
          </p>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Connexion..." : "Se connecter"}
      </Button>
    </form>
  );
}
