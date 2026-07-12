"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { GuestIdentityForm } from "@/components/GuestIdentityForm";

type InitialIdentity = {
  firstName: string;
  lastName: string;
  phone: string;
  gender: "female" | "male" | null;
  avatarKind: "preset" | "photo";
  avatarValue: string | null;
};

// Point d'entrée d'un visiteur pas encore participant. Porte unique (retour
// Thomas : "que les gens se connectent à leur compte directement" -- plus de
// "continuer sans compte" ni de code de récupération, tout le monde doit
// avoir un vrai compte).
// `hasSession` : déjà connecté (compte réel) → formulaire d'identité
// directement ; sinon un seul bouton vers `/connexion`.
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
  const [view] = useState<"door" | "form">(hasSession ? "form" : "door");

  if (view === "form") {
    return (
      <GuestIdentityForm
        eventId={eventId}
        shortCode={shortCode}
        allowCompanions={allowCompanions}
        initial={initial}
        onSuccess={() => router.refresh()}
      />
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
    </div>
  );
}
