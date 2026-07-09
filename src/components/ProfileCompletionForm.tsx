"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { completeProfile } from "@/app/[locale]/actions/profile";
import { uploadAvatarPhoto } from "@/app/[locale]/actions/avatar";
import { PRESET_AVATARS } from "@/lib/avatars";
import { Button } from "@/components/ui/Button";

export function ProfileCompletionForm({ next }: { next: string }) {
  const t = useTranslations("ProfileCompletion");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"female" | "male" | null>(null);
  const [avatarKind, setAvatarKind] = useState<"preset" | "photo">("preset");
  const [avatarValue, setAvatarValue] = useState<string | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function canSubmit() {
    return (
      firstName.trim() &&
      lastName.trim() &&
      phone.trim() &&
      gender &&
      (avatarKind === "preset" ? !!avatarValue : !!avatarValue && !avatarUploading)
    );
  }

  function handleSubmit() {
    if (!canSubmit()) return;
    setError(null);

    startTransition(async () => {
      // completeProfile redirige elle-même en cas de succès (comme
      // createEvent/updateEvent) : ce résultat ne s'observe donc jamais que
      // sur l'échec.
      const result = await completeProfile(
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          gender: gender!,
          avatarKind,
          avatarValue: avatarValue ?? undefined,
        },
        next,
      );
      if (!result.ok) {
        setError(result.error === "invalid" ? t("errorInvalid") : t("errorUnknown"));
      }
    });
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
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
          autoComplete="tel"
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
            onClick={() => fileInputRef.current?.click()}
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="hidden"
        />
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}

      <Button onClick={handleSubmit} disabled={isPending || !canSubmit()}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </div>
  );
}

const inputClass =
  "w-full rounded-full border border-border bg-surface px-5 py-3 text-base text-foreground placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

// `<label>` (pas un simple `<div>`+`<span>`) : associe implicitement le champ
// à son intitulé, indispensable pour l'accessibilité (lecteurs d'écran) et
// pour que `getByLabel` (Playwright) puisse cibler le champ de façon fiable —
// bug réel découvert en investiguant un test e2e bloqué sur ce formulaire.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-left">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}
