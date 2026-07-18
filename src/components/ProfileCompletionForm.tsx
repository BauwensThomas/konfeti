"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { completeProfile, updateProfile } from "@/app/[locale]/actions/profile";
import { uploadAvatarPhoto } from "@/app/[locale]/actions/avatar";
import { PRESET_AVATARS } from "@/lib/avatars";
import { Button } from "@/components/ui/Button";
import { PhotoSourceModal } from "@/components/ui/PhotoSourceModal";
import { notifySessionExpired } from "@/lib/session-expired";

type InitialProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  gender: "female" | "male" | null;
  avatarKind: "preset" | "photo";
  avatarValue: string | null;
  avatarPreviewUrl: string | null;
};

// Deux contextes d'utilisation (retour Thomas : lien "Modifier mon profil"
// dans le footer, distinct du parcours obligatoire d'onboarding) : `mode`
// bascule entre `completeProfile` (redirige toujours, formulaire vide au
// départ) et `updateProfile` (ne redirige jamais — l'utilisateur peut venir
// de n'importe quelle page — affiche une confirmation, et répercute le
// changement sur les événements déjà rejoints). Mêmes champs/composants
// dans les deux cas, `initial` préremplit uniquement en mode édition.
export function ProfileCompletionForm({
  next,
  mode = "complete",
  initial,
}: {
  next?: string;
  mode?: "complete" | "edit";
  initial?: InitialProfile;
}) {
  const t = useTranslations("ProfileCompletion");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [gender, setGender] = useState<"female" | "male" | null>(initial?.gender ?? null);
  const [avatarKind, setAvatarKind] = useState<"preset" | "photo">(initial?.avatarKind ?? "preset");
  const [avatarValue, setAvatarValue] = useState<string | null>(initial?.avatarValue ?? null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(
    initial?.avatarKind === "photo" ? (initial.avatarPreviewUrl ?? null) : null,
  );
  const [avatarUploading, setAvatarUploading] = useState(false);
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
    } else if (result.error === "not_authenticated") {
      notifySessionExpired();
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
    setSaved(false);

    startTransition(async () => {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        gender: gender!,
        avatarKind,
        avatarValue: avatarValue ?? undefined,
      };

      if (mode === "edit") {
        const result = await updateProfile(payload);
        if (result.ok) {
          setSaved(true);
          // Retour à la page précédente (retour Thomas : "je suis bloqué sur
          // la page, il faut renvoyer vers la page que la personne était
          // avant d'arriver dans le profil") — jamais de destination fixe
          // possible ici, /profil est accessible depuis n'importe où via le
          // footer. Court délai pour laisser voir la confirmation avant de
          // quitter la page. Retour Thomas : "il faut que la page se
          // refresh" -- `router.back()` restaure la page précédente depuis
          // le cache client de Next.js, jamais garanti à jour avec les
          // nouvelles données serveur ; `router.refresh()` force le
          // re-fetch, comme partout ailleurs dans le projet après une
          // mutation.
          setTimeout(() => {
            router.back();
            router.refresh();
          }, 900);
        } else if (result.error === "not_authenticated") {
          notifySessionExpired();
        } else {
          setError(
            result.error === "invalid"
              ? t("errorInvalid")
              : result.error === "rate_limited"
                ? t("errorRateLimited")
                : t("errorUnknown"),
          );
        }
        return;
      }

      // completeProfile redirige elle-même en cas de succès (comme
      // createEvent/updateEvent) : ce résultat ne s'observe donc jamais que
      // sur l'échec.
      const result = await completeProfile(payload, next ?? "/mes-evenements");
      if (!result.ok) {
        if (result.error === "not_authenticated") {
          notifySessionExpired();
        } else {
          setError(result.error === "invalid" ? t("errorInvalid") : t("errorUnknown"));
        }
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

      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}

      {mode === "edit" && saved && !error && (
        <p role="status" className="text-sm font-semibold text-accent-mint">
          {t("saved")}
        </p>
      )}

      <div className="flex items-center justify-center gap-3">
        <Button className="h-11" onClick={handleSubmit} disabled={isPending || !canSubmit()}>
          {isPending ? t("submitting") : mode === "edit" ? t("save") : t("submit")}
        </Button>
        {/* Croix rouge pour revenir en arrière sans enregistrer (retour
            Thomas, même demande que sur le wizard "Modifier" d'un événement) :
            uniquement en édition -- en `complete` (onboarding obligatoire),
            il n'y a nulle part de sensé où "revenir" sans avoir terminé. */}
        {mode === "edit" && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t("cancelEdit")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-coral text-white shadow-konfeti transition-[background-color,transform] duration-150 ease-out hover:brightness-95 active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
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
