"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { submitRsvp } from "@/app/[locale]/actions/rsvp";
import { uploadAvatarPhoto } from "@/app/[locale]/actions/avatar";
import type { RsvpIdentityInput } from "@/lib/validation/rsvp";
import { PRESET_AVATARS } from "@/lib/avatars";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { PhotoSourceModal } from "@/components/ui/PhotoSourceModal";

type CompanionKind = "partner" | "child" | "friend" | "family";
type Companion = { kind: CompanionKind; firstName: string };
const COMPANION_KINDS: CompanionKind[] = ["partner", "child", "friend", "family"];

function companionKindLabel(kind: CompanionKind, t: ReturnType<typeof useTranslations>) {
  if (kind === "partner") return t("companionKindPartner");
  if (kind === "child") return t("companionKindChild");
  if (kind === "friend") return t("companionKindFriend");
  return t("companionKindFamily");
}

type InitialIdentity = {
  firstName: string;
  lastName: string;
  phone: string;
  gender: "female" | "male" | null;
  avatarKind: "preset" | "photo";
  avatarValue: string | null;
};

export function GuestIdentityForm({
  eventId,
  shortCode,
  allowCompanions,
  initial,
  onSuccess,
}: {
  eventId: string;
  shortCode: string;
  allowCompanions: boolean;
  initial: InitialIdentity | null;
  onSuccess: () => void;
}) {
  const t = useTranslations("GuestIdentity");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [gender, setGender] = useState<"female" | "male" | null>(initial?.gender ?? null);
  const [avatarKind, setAvatarKind] = useState<"preset" | "photo">(initial?.avatarKind ?? "preset");
  const [avatarValue, setAvatarValue] = useState<string | null>(initial?.avatarValue ?? null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [answer, setAnswer] = useState<"yes" | "maybe" | "no" | null>(null);
  const [companions, setCompanions] = useState<Companion[]>([]);
  // Popup de choix de type d'accompagnant (retour Thomas : "j'aimerais que
  // tout ce qui est liste devienne des popups comme le reste du projet") --
  // index de la ligne concernée, `null` si aucun popup ouvert.
  const [kindPickerIndex, setKindPickerIndex] = useState<number | null>(null);
  // Consentement rappels par email (brief 4.7) : JAMAIS pré-coché.
  const [wantsReminders, setWantsReminders] = useState(false);
  const [showPhotoSource, setShowPhotoSource] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarPreviewUrl(URL.createObjectURL(file));
    setAvatarKind("photo");
    setAvatarUploading(true);

    const formData = new FormData();
    formData.append("photo", file);
    const result = await uploadAvatarPhoto(formData);

    setAvatarUploading(false);
    if (result.ok) {
      setAvatarValue(result.path);
    } else {
      setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorPhoto"));
    }
  }

  function addCompanion() {
    setCompanions((prev) => [...prev, { kind: "partner", firstName: "" }]);
  }

  function updateCompanion(index: number, patch: Partial<Companion>) {
    setCompanions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeCompanion(index: number) {
    setCompanions((prev) => prev.filter((_, i) => i !== index));
  }

  function canSubmit() {
    return (
      firstName.trim() &&
      lastName.trim() &&
      phone.trim() &&
      gender &&
      answer &&
      (avatarKind === "preset" ? !!avatarValue : !!avatarValue && !avatarUploading)
    );
  }

  function handleSubmit() {
    if (!canSubmit()) return;
    setError(null);

    const payload: RsvpIdentityInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      gender: gender!,
      avatarKind,
      avatarValue: avatarValue ?? undefined,
      answer: answer!,
      companions: companions.map((c) => ({
        kind: c.kind,
        firstName: c.firstName.trim() || undefined,
      })),
      wantsReminders,
    };

    startTransition(async () => {
      const result = await submitRsvp(eventId, shortCode, payload);
      if (result.ok) {
        onSuccess();
      } else {
        setError(
          result.error === "rate_limited"
            ? t("errorRateLimited")
            : result.error === "blocked"
              ? t("errorBlocked")
              : t("errorUnknown"),
        );
      }
    });
  }

  return (
    <Card className="flex w-full max-w-sm lg:max-w-md flex-col gap-4">
      <h2 className="font-display text-xl text-foreground">{t("heading")}</h2>

      <Field label={t("firstNameLabel")}>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder={t("firstNamePlaceholder")}
          className={inputClass}
        />
      </Field>

      <Field label={t("lastNameLabel")}>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder={t("lastNamePlaceholder")}
          className={inputClass}
        />
      </Field>

      <Field label={t("phoneLabel")}>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("phonePlaceholder")}
          className={inputClass}
        />
      </Field>

      <fieldset>
        <legend className="mb-1 text-left text-sm font-semibold text-foreground">
          {t("genderLabel")}
        </legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-base text-foreground">
            <input
              type="radio"
              name="gender"
              checked={gender === "female"}
              onChange={() => setGender("female")}
            />
            {t("genderFemale")}
          </label>
          <label className="flex items-center gap-2 text-base text-foreground">
            <input
              type="radio"
              name="gender"
              checked={gender === "male"}
              onChange={() => setGender("male")}
            />
            {t("genderMale")}
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-left text-sm font-semibold text-foreground">
          {t("avatarLabel")}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_AVATARS.map((avatar, index) => (
            <button
              key={avatar.key}
              type="button"
              aria-label={t("avatarOptionLabel", { number: index + 1 })}
              onClick={() => {
                setAvatarKind("preset");
                setAvatarValue(avatar.key);
              }}
              className={`mx-auto flex h-22 w-22 items-center justify-center overflow-hidden rounded-full border-2 transition-[transform] active:scale-95 ${
                avatarKind === "preset" && avatarValue === avatar.key
                  ? "border-primary"
                  : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, next/image réintroduisait un fond noir */}
              <img src={avatar.path} alt="" className="h-full w-full object-contain" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowPhotoSource(true)}
            className={`relative mx-auto flex h-22 w-22 items-center justify-center overflow-hidden rounded-full border-2 bg-surface text-sm font-semibold text-primary ${
              avatarKind === "photo" ? "border-primary" : "border-border"
            }`}
          >
            {avatarPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), pas une image optimisable par next/image
              <img src={avatarPreviewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              t("avatarPhotoOption")
            )}
          </button>
        </div>
        <PhotoSourceModal
          open={showPhotoSource}
          onClose={() => setShowPhotoSource(false)}
          onCamera={() => {
            setShowPhotoSource(false);
            cameraInputRef.current?.click();
          }}
          onGallery={() => {
            setShowPhotoSource(false);
            galleryInputRef.current?.click();
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoChange}
          className="hidden"
        />
        <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
      </fieldset>

      {allowCompanions && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-left text-sm font-semibold text-foreground">
            {t("companionsLabel")}
          </legend>
          {companions.map((companion, index) => (
            <div key={index} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setKindPickerIndex(index)}
                className={`${inputClass} text-left`}
              >
                {companionKindLabel(companion.kind, t)}
              </button>
              <input
                type="text"
                value={companion.firstName}
                onChange={(e) => updateCompanion(index, { firstName: e.target.value })}
                placeholder={t("companionFirstNamePlaceholder")}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => removeCompanion(index)}
                aria-label={t("companionRemove")}
                className="shrink-0 text-sm font-semibold text-accent-coral"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCompanion}
            className="w-fit text-sm font-semibold text-primary"
          >
            {t("companionAdd")}
          </button>
        </fieldset>
      )}

      <Modal open={kindPickerIndex !== null} onClose={() => setKindPickerIndex(null)}>
        <div className="flex flex-col gap-1">
          {COMPANION_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                if (kindPickerIndex !== null) updateCompanion(kindPickerIndex, { kind });
                setKindPickerIndex(null);
              }}
              className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
            >
              {companionKindLabel(kind, t)}
            </button>
          ))}
        </div>
      </Modal>

      <fieldset>
        <legend className="mb-1 text-left text-sm font-semibold text-foreground">
          {t("answerLabel")}
        </legend>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-base text-foreground">
            <input type="radio" name="answer" checked={answer === "yes"} onChange={() => setAnswer("yes")} />
            {t("answerYes")}
          </label>
          <label className="flex items-center gap-2 text-base text-foreground">
            <input
              type="radio"
              name="answer"
              checked={answer === "maybe"}
              onChange={() => setAnswer("maybe")}
            />
            {t("answerMaybe")}
          </label>
          <label className="flex items-center gap-2 text-base text-foreground">
            <input type="radio" name="answer" checked={answer === "no"} onChange={() => setAnswer("no")} />
            {t("answerNo")}
          </label>
        </div>
      </fieldset>

      {/* Consentement rappels par email (brief 4.7/section 9, RGPD) : JAMAIS
          pré-coché -- `useState(false)` par défaut, opt-in explicite. */}
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={wantsReminders}
          onChange={(e) => setWantsReminders(e.target.checked)}
          className="mt-0.5"
        />
        {t("wantsRemindersLabel")}
      </label>

      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}

      <Button onClick={handleSubmit} disabled={isPending || !canSubmit()}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </Card>
  );
}

const inputClass =
  "w-full rounded-konfeti border border-border bg-surface px-4 py-2.5 text-base text-foreground placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// `<label>` (pas un simple `<div>`+`<span>`) : associe implicitement le champ
// à son intitulé (accessibilité + `getByLabel` Playwright), même correctif
// que ProfileCompletionForm (bug identique, découvert en investiguant un
// test e2e bloqué sur ce même motif).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-left">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}
