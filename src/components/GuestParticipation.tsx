"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { redeemGuestCode } from "@/app/[locale]/actions/rsvp";
import { GuestIdentityForm } from "@/components/GuestIdentityForm";
import { GuestPendingScreen } from "@/components/GuestPendingScreen";
import { Button } from "@/components/ui/Button";

type InitialIdentity = {
  firstName: string;
  lastName: string;
  phone: string;
  gender: "female" | "male" | null;
  avatarKind: "preset" | "photo";
  avatarValue: string | null;
};

// Point d'entrée d'un visiteur pas encore participant (brief 1.2, double
// porte). `hasSession` distingue deux cas : quelqu'un déjà "dans" une session
// (compte réel connecté, ou anonyme d'un précédent événement Konfeti sur cet
// appareil) passe directement au formulaire ; sinon on propose les deux
// portes (compte, ou continuer sans compte — la session anonyme n'est créée
// qu'au moment de l'envoi du formulaire, pas avant).
export function GuestParticipation({
  eventId,
  shortCode,
  allowCompanions,
  hasSession,
  initial,
}: {
  eventId: string;
  shortCode: string;
  allowCompanions: boolean;
  hasSession: boolean;
  initial: InitialIdentity | null;
}) {
  const t = useTranslations("GuestIdentity");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"doors" | "form" | "code" | "pending">(
    hasSession ? "form" : "doors",
  );
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  function handleRedeemCode() {
    setCodeError(null);
    startTransition(async () => {
      const result = await redeemGuestCode(code);
      if (result.ok) {
        router.push(`/e/${result.shortCode}`);
        router.refresh();
      } else {
        setCodeError(
          result.error === "conflict" ? t("codeErrorConflict") : t("codeErrorInvalid"),
        );
      }
    });
  }

  if (view === "pending") {
    return <GuestPendingScreen />;
  }

  if (view === "form") {
    return (
      <GuestIdentityForm
        eventId={eventId}
        shortCode={shortCode}
        allowCompanions={allowCompanions}
        initial={initial}
        onSuccess={() => setView("pending")}
      />
    );
  }

  if (view === "code") {
    return (
      <div className="flex w-full max-w-sm lg:max-w-md flex-col gap-3">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("codePlaceholder")}
          className="w-full rounded-konfeti border border-border bg-surface px-4 py-2.5 text-center text-base uppercase text-foreground placeholder:normal-case placeholder:text-foreground/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        {codeError && (
          <p role="alert" className="text-center text-sm text-accent-coral">
            {codeError}
          </p>
        )}
        <Button onClick={handleRedeemCode} disabled={isPending || !code.trim()}>
          {isPending ? t("codeSubmitting") : t("codeSubmit")}
        </Button>
        <button
          type="button"
          onClick={() => setView("doors")}
          className="text-sm font-semibold text-primary underline"
        >
          {t("codeBack")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm lg:max-w-md flex-col items-center gap-3">
      <Link
        href={`/connexion?next=/e/${shortCode}`}
        className="w-full rounded-full bg-primary px-6 py-3 text-center font-display text-base font-semibold text-white shadow-konfeti transition-[background-color,transform] active:scale-95 hover:bg-primary-hover"
      >
        {t("doorLogin")}
      </Link>
      <Button variant="secondary" className="w-full" onClick={() => setView("form")}>
        {t("doorGuest")}
      </Button>
      <button
        type="button"
        onClick={() => setView("code")}
        className="text-sm font-semibold text-primary underline"
      >
        {t("doorCode")}
      </button>
    </div>
  );
}
