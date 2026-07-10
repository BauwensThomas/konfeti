"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createEvent, updateEvent } from "@/app/[locale]/actions/events";
import { uploadEventPhoto } from "@/app/[locale]/actions/upload";
import { EVENT_THEMES } from "@/lib/themes";
import { OCCASIONS } from "@/lib/validation/event";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { toLocalDateTimeValue } from "@/lib/datetime";

type DateOption = { startsAt: string; label: string };

export type WizardData = {
  title: string;
  theme: string;
  dateMode: "fixed" | "poll";
  startsAt: string;
  endsAt: string;
  dateOptions: DateOption[];
  locationText: string;
  coverPhotoPath: string;
  occasion: (typeof OCCASIONS)[number];
  birthdayPerson: string;
  birthdayDate: string;
  showAge: boolean;
  housewarmingHosts: string[];
  bachelorPerson: string;
  description: string;
  instructions: string;
  dressCode: string;
  bringGeneral: string;
  rsvpDeadline: string;
  kidsAllowed: "" | "yes" | "no" | "details";
  petsAllowed: "" | "yes" | "no" | "details";
  maxGuests: string;
  allowCompanions: boolean;
  autoApprove: boolean;
  sharePolicy: "all" | "admins";
  potEnabled: boolean;
  potMode: "goal" | "open";
  potGoalEuros: string;
  potLabel: string;
};

const INITIAL_DATA: WizardData = {
  title: "",
  theme: EVENT_THEMES[0].key,
  dateMode: "fixed",
  startsAt: "",
  endsAt: "",
  dateOptions: [
    { startsAt: "", label: "" },
    { startsAt: "", label: "" },
  ],
  locationText: "",
  coverPhotoPath: "",
  occasion: "other",
  birthdayPerson: "",
  birthdayDate: "",
  showAge: true,
  housewarmingHosts: [""],
  bachelorPerson: "",
  description: "",
  instructions: "",
  dressCode: "",
  bringGeneral: "",
  rsvpDeadline: "",
  kidsAllowed: "",
  petsAllowed: "",
  maxGuests: "",
  allowCompanions: true,
  autoApprove: false,
  sharePolicy: "all",
  potEnabled: false,
  potMode: "goal",
  potGoalEuros: "",
  potLabel: "",
};

const TOTAL_STEPS = 4;

type CreateEventWizardProps = {
  eventId?: string;
  shortCode?: string;
  initialData?: WizardData;
  initialPhotoUrl?: string | null;
};

export function CreateEventWizard({
  eventId,
  shortCode,
  initialData,
  initialPhotoUrl,
}: CreateEventWizardProps) {
  const isEditMode = !!eventId;
  const t = useTranslations("CreateEvent");
  const tThemes = useTranslations("Themes");
  const tOccasions = useTranslations("Occasions");
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(initialData ?? INITIAL_DATA);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(initialPhotoUrl ?? null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [confirmingPhotoDelete, setConfirmingPhotoDelete] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  // Une photo déjà présente ouvre un petit menu (changer/supprimer) au clic ;
  // sans photo, le clic ouvre directement le picker du téléphone (pas de
  // menu superflu à traverser, demande de Thomas).
  function handleAvatarClick() {
    if (photoPreviewUrl) {
      setPhotoMenuOpen((open) => !open);
    } else {
      photoInputRef.current?.click();
    }
  }

  function handleChangePhotoClick() {
    setPhotoMenuOpen(false);
    photoInputRef.current?.click();
  }

  function handleDeletePhotoConfirmed() {
    setPhotoPreviewUrl(null);
    update("coverPhotoPath", "");
    setConfirmingPhotoDelete(false);
    setPhotoMenuOpen(false);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoError(null);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoUploading(true);

    const formData = new FormData();
    formData.append("photo", file);
    const result = await uploadEventPhoto(formData);

    setPhotoUploading(false);
    if (result.ok) {
      update("coverPhotoPath", result.path);
    } else {
      setPhotoError(result.error === "rate_limited" ? t("step1.photoRateLimited") : t("step1.photoError"));
    }
  }

  // Un événement DÉJÀ passé doit rester modifiable (corriger une coquille),
  // mais faire reculer un événement encore à venir vers le passé ne doit pas
  // être possible (bug réel corrigé, retour Thomas — voir validation/event.ts
  // pour le détail et la même règle appliquée côté serveur). `initialData`
  // capture la date telle qu'enregistrée AVANT cette session d'édition ; elle
  // ne change jamais pendant que `data.startsAt` est modifié en direct.
  const originalAlreadyPast =
    isEditMode &&
    initialData?.dateMode === "fixed" &&
    !!initialData?.startsAt &&
    new Date(initialData.startsAt) < new Date();

  // Valeur minimale des champs datetime-local : on ne peut pas créer/déplacer
  // un événement dans le passé (demande de Thomas, évite les événements
  // "fantômes" créés par erreur).
  const minDateTimeLocal = originalAlreadyPast ? undefined : toLocalDateTimeValue(new Date());

  const startsAtInPast =
    !originalAlreadyPast &&
    data.dateMode === "fixed" &&
    !!data.startsAt &&
    new Date(data.startsAt) < new Date();
  const dateOptionsInPast =
    !originalAlreadyPast &&
    data.dateMode === "poll" &&
    data.dateOptions.some((option) => option.startsAt && new Date(option.startsAt) < new Date());

  const rsvpDeadlineTooLate =
    data.dateMode === "fixed" &&
    !!data.startsAt &&
    !!data.rsvpDeadline &&
    new Date(data.rsvpDeadline) > new Date(data.startsAt);
  // Comparaison en dates civiles, pas en horodatage exact : ce champ est un
  // `<input type="date">` (pas d'heure), qui se parse à minuit -- le comparer
  // à l'heure exacte actuelle rejetterait à tort la journée du jour même dès
  // qu'il n'est plus minuit pile (même raison que côté serveur).
  const rsvpDeadlineInPast = (() => {
    if (originalAlreadyPast || !data.rsvpDeadline) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(data.rsvpDeadline) < today;
  })();

  function canAdvance() {
    if (step === 1) {
      if (!data.title.trim() || !data.locationText.trim()) return false;
      if (startsAtInPast || dateOptionsInPast) return false;
      if (data.dateMode === "fixed") return !!data.startsAt;
      return data.dateOptions.filter((o) => o.startsAt).length >= 2;
    }
    if (step === 3) {
      return !rsvpDeadlineTooLate && !rsvpDeadlineInPast;
    }
    return true;
  }

  // L'âge fêté se déduit de la date de naissance et de la date de la fête
  // (ou de l'année en cours si la date de la fête n'est pas encore fixée),
  // pas besoin de le demander séparément.
  const birthdayAge = computeBirthdayAge(
    data.birthdayDate,
    data.dateMode === "fixed" ? data.startsAt : "",
  );

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const payload = {
        title: data.title,
        theme: data.theme,
        dateMode: data.dateMode,
        startsAt: data.dateMode === "fixed" ? data.startsAt : undefined,
        endsAt: data.endsAt || undefined,
        dateOptions:
          data.dateMode === "poll"
            ? data.dateOptions
                .filter((o) => o.startsAt)
                .map((o) => ({ startsAt: o.startsAt, label: o.label || undefined }))
            : undefined,
        locationText: data.locationText,
        coverPhotoPath: data.coverPhotoPath || undefined,
        occasion: data.occasion,
        birthdayPerson: data.birthdayPerson || undefined,
        birthdayDate: data.birthdayDate || undefined,
        birthdayAge: birthdayAge ?? undefined,
        showAge: data.showAge,
        housewarmingHosts: data.housewarmingHosts.filter((h) => h.trim()).length
          ? data.housewarmingHosts.filter((h) => h.trim())
          : undefined,
        bachelorPerson: data.bachelorPerson || undefined,
        description: data.description || undefined,
        instructions: data.instructions || undefined,
        dressCode: data.dressCode || undefined,
        bringGeneral: data.bringGeneral || undefined,
        rsvpDeadline: data.rsvpDeadline || undefined,
        kidsAllowed: data.kidsAllowed || undefined,
        petsAllowed: data.petsAllowed || undefined,
        maxGuests: data.maxGuests ? Number(data.maxGuests) : undefined,
        allowCompanions: data.allowCompanions,
        autoApprove: data.autoApprove,
        sharePolicy: data.sharePolicy,
        potEnabled: data.potEnabled,
        potMode: data.potMode,
        potGoalCents:
          data.potEnabled && data.potMode === "goal" && data.potGoalEuros
            ? Math.round(Number(data.potGoalEuros) * 100)
            : undefined,
        potLabel: data.potLabel || undefined,
      };

      const result =
        isEditMode && eventId && shortCode
          ? await updateEvent(eventId, shortCode, payload)
          : await createEvent(payload);

      if (result && !result.ok) {
        setError(result.error === "rate_limited" ? t("errorRateLimited") : t("errorUnknown"));
      }
    });
  }

  return (
    <div className="flex w-full max-w-lg lg:max-w-2xl flex-col gap-6">
      <p className="text-center text-sm font-semibold text-primary">
        {t("stepIndicator", { current: step, total: TOTAL_STEPS })}
      </p>

      <Card>
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-xl text-foreground">{t("step1.heading")}</h2>

            <Field label={t("step1.titleLabel")}>
              <input
                type="text"
                value={data.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder={t("step1.titlePlaceholder")}
                className={inputClass}
              />
            </Field>

            <Field label={t("step1.photoLabel")}>
              <button
                type="button"
                onClick={handleAvatarClick}
                className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full transition-[transform] active:scale-95"
              >
                {photoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) ou URL signée, pas une image optimisable par next/image
                  <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <AvatarPlaceholder className="h-full w-full" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs font-semibold text-white opacity-0 transition-opacity hover:opacity-100">
                  {t("step1.photoChange")}
                </span>
              </button>

              <Modal open={photoMenuOpen && !confirmingPhotoDelete} onClose={() => setPhotoMenuOpen(false)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, on évite le ré-encodage par l'optimiseur next/image (qui réintroduisait un fond noir) */}
                <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
                <Button onClick={handleChangePhotoClick}>{t("step1.photoChange")}</Button>
                <Button variant="ghost" onClick={() => setConfirmingPhotoDelete(true)}>
                  {t("step1.photoDelete")}
                </Button>
              </Modal>

              <Modal open={confirmingPhotoDelete} onClose={() => setConfirmingPhotoDelete(false)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, on évite le ré-encodage par l'optimiseur next/image (qui réintroduisait un fond noir) */}
                <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
                <p className="text-center text-base text-foreground">{t("step1.photoDeleteConfirm")}</p>
                <div className="flex justify-center gap-3">
                  <Button onClick={handleDeletePhotoConfirmed}>{t("step1.photoDeleteConfirmYes")}</Button>
                  <Button variant="ghost" onClick={() => setConfirmingPhotoDelete(false)}>
                    {t("step1.photoDeleteConfirmNo")}
                  </Button>
                </div>
              </Modal>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
              {photoUploading && (
                <p className="text-sm text-foreground/60">{t("step1.photoUploading")}</p>
              )}
              {photoError && <p className="text-sm text-accent-coral">{photoError}</p>}
            </Field>

            <Field label={t("step1.themeLabel")}>
              <div className="grid grid-cols-3 gap-2">
                {EVENT_THEMES.map((theme) => (
                  <button
                    key={theme.key}
                    type="button"
                    onClick={() => update("theme", theme.key)}
                    className={`flex h-16 items-center justify-center rounded-konfeti border-2 p-2 text-center text-xs font-semibold text-white transition-[border-color] ${
                      data.theme === theme.key ? "border-foreground" : "border-transparent"
                    }`}
                    style={{
                      background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
                    }}
                  >
                    {tThemes(theme.key)}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={t("step1.dateModeLabel")}>
              <div className="flex gap-2">
                <ToggleButton
                  active={data.dateMode === "fixed"}
                  onClick={() => update("dateMode", "fixed")}
                >
                  {t("step1.dateModeFixed")}
                </ToggleButton>
                <ToggleButton
                  active={data.dateMode === "poll"}
                  onClick={() => update("dateMode", "poll")}
                >
                  {t("step1.dateModePoll")}
                </ToggleButton>
              </div>
            </Field>

            {data.dateMode === "fixed" ? (
              <>
                <Field label={t("step1.startsAtLabel")}>
                  <input
                    type="datetime-local"
                    value={data.startsAt}
                    min={minDateTimeLocal}
                    onChange={(e) => update("startsAt", e.target.value)}
                    className={inputClass}
                  />
                  {startsAtInPast && (
                    <p className="text-sm text-accent-coral">{t("step1.dateInPast")}</p>
                  )}
                </Field>
                <Field label={t("step1.endsAtLabel")}>
                  <input
                    type="datetime-local"
                    value={data.endsAt}
                    onChange={(e) => update("endsAt", e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                {data.dateOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={option.startsAt}
                      min={minDateTimeLocal}
                      onChange={(e) => {
                        const next = [...data.dateOptions];
                        next[index] = { ...next[index], startsAt: e.target.value };
                        update("dateOptions", next);
                      }}
                      aria-label={t("step1.dateOptionLabel", { index: index + 1 })}
                      className={inputClass}
                    />
                    {data.dateOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            "dateOptions",
                            data.dateOptions.filter((_, i) => i !== index),
                          )
                        }
                        className="text-sm text-accent-coral"
                      >
                        {t("step1.removeDateOption")}
                      </button>
                    )}
                  </div>
                ))}
                {data.dateOptions.length < 5 && (
                  <button
                    type="button"
                    onClick={() =>
                      update("dateOptions", [...data.dateOptions, { startsAt: "", label: "" }])
                    }
                    className="text-sm font-semibold text-primary"
                  >
                    + {t("step1.addDateOption")}
                  </button>
                )}
                {dateOptionsInPast && (
                  <p className="text-sm text-accent-coral">{t("step1.dateInPast")}</p>
                )}
              </div>
            )}

            <Field label={t("step1.locationLabel")}>
              <input
                type="text"
                value={data.locationText}
                onChange={(e) => update("locationText", e.target.value)}
                placeholder={t("step1.locationPlaceholder")}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-xl text-foreground">{t("step2.heading")}</h2>

            <Field label={t("step2.occasionLabel")}>
              <select
                value={data.occasion}
                onChange={(e) => update("occasion", e.target.value as WizardData["occasion"])}
                className={inputClass}
              >
                {OCCASIONS.map((occasion) => (
                  <option key={occasion} value={occasion}>
                    {tOccasions(occasion)}
                  </option>
                ))}
              </select>
            </Field>

            {data.occasion === "birthday" && (
              <>
                <Field label={t("step2.birthdayPersonLabel")}>
                  <input
                    type="text"
                    value={data.birthdayPerson}
                    onChange={(e) => update("birthdayPerson", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t("step2.birthdayDateLabel")}>
                  <input
                    type="date"
                    value={data.birthdayDate}
                    onChange={(e) => update("birthdayDate", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                {birthdayAge !== null && (
                  <>
                    <p className="text-sm font-semibold text-primary">
                      {t("step2.computedAge", { age: birthdayAge })}
                    </p>
                    <label className="flex items-center gap-2 text-base text-foreground">
                      <input
                        type="checkbox"
                        checked={data.showAge}
                        onChange={(e) => update("showAge", e.target.checked)}
                      />
                      {t("step2.showAgeLabel")}
                    </label>
                  </>
                )}
              </>
            )}

            {data.occasion === "housewarming" && (
              <Field label={t("step2.housewarmingHostsLabel")}>
                <div className="flex flex-col gap-2">
                  {data.housewarmingHosts.map((host, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={host}
                        onChange={(e) => {
                          const next = [...data.housewarmingHosts];
                          next[index] = e.target.value;
                          update("housewarmingHosts", next);
                        }}
                        aria-label={t("step2.housewarmingHostLabel", { index: index + 1 })}
                        className={inputClass}
                      />
                      {data.housewarmingHosts.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            update(
                              "housewarmingHosts",
                              data.housewarmingHosts.filter((_, i) => i !== index),
                            )
                          }
                          className="text-sm text-accent-coral"
                        >
                          {t("step2.removeHousewarmingHost")}
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      update("housewarmingHosts", [...data.housewarmingHosts, ""])
                    }
                    className="text-sm font-semibold text-primary"
                  >
                    + {t("step2.addHousewarmingHost")}
                  </button>
                </div>
              </Field>
            )}

            {data.occasion === "bachelor" && (
              <Field label={t("step2.bachelorPersonLabel")}>
                <input
                  type="text"
                  value={data.bachelorPerson}
                  onChange={(e) => update("bachelorPerson", e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}

            <Field label={t("step2.descriptionLabel")}>
              <textarea
                value={data.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder={t("step2.descriptionPlaceholder")}
                rows={3}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-xl text-foreground">{t("step3.heading")}</h2>

            <Field label={t("step3.instructionsLabel")}>
              <textarea
                value={data.instructions}
                onChange={(e) => update("instructions", e.target.value)}
                placeholder={t("step3.instructionsPlaceholder")}
                rows={2}
                className={inputClass}
              />
            </Field>

            <Field label={t("step3.dressCodeLabel")}>
              <input
                type="text"
                value={data.dressCode}
                onChange={(e) => update("dressCode", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label={t("step3.bringGeneralLabel")}>
              <input
                type="text"
                value={data.bringGeneral}
                onChange={(e) => update("bringGeneral", e.target.value)}
                placeholder={t("step3.bringGeneralPlaceholder")}
                className={inputClass}
              />
            </Field>

            <Field label={t("step3.rsvpDeadlineLabel")}>
              <input
                type="date"
                value={data.rsvpDeadline}
                onChange={(e) => update("rsvpDeadline", e.target.value)}
                min={originalAlreadyPast ? undefined : new Date().toISOString().slice(0, 10)}
                className={inputClass}
              />
              {rsvpDeadlineInPast && (
                <p className="text-sm text-accent-coral">{t("step3.rsvpDeadlineInPast")}</p>
              )}
              {rsvpDeadlineTooLate && (
                <p className="text-sm text-accent-coral">
                  {t("step3.rsvpDeadlineTooLate")}
                </p>
              )}
            </Field>

            <Field label={t("step3.kidsAllowedLabel")}>
              <select
                value={data.kidsAllowed}
                onChange={(e) =>
                  update("kidsAllowed", e.target.value as WizardData["kidsAllowed"])
                }
                className={inputClass}
              >
                <option value=""></option>
                <option value="yes">{t("step3.yes")}</option>
                <option value="no">{t("step3.no")}</option>
                <option value="details">{t("step3.details")}</option>
              </select>
            </Field>

            <Field label={t("step3.petsAllowedLabel")}>
              <select
                value={data.petsAllowed}
                onChange={(e) =>
                  update("petsAllowed", e.target.value as WizardData["petsAllowed"])
                }
                className={inputClass}
              >
                <option value=""></option>
                <option value="yes">{t("step3.yes")}</option>
                <option value="no">{t("step3.no")}</option>
                <option value="details">{t("step3.details")}</option>
              </select>
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-xl text-foreground">{t("step4.heading")}</h2>

            <Field label={t("step4.maxGuestsLabel")}>
              <input
                type="number"
                min={1}
                value={data.maxGuests}
                onChange={(e) => update("maxGuests", e.target.value)}
                className={inputClass}
              />
            </Field>

            <label className="flex items-center gap-2 text-base text-foreground">
              <input
                type="checkbox"
                checked={data.allowCompanions}
                onChange={(e) => update("allowCompanions", e.target.checked)}
              />
              {t("step4.allowCompanionsLabel")}
            </label>

            <label className="flex items-center gap-2 text-base text-foreground">
              <input
                type="checkbox"
                checked={data.autoApprove}
                onChange={(e) => update("autoApprove", e.target.checked)}
              />
              {t("step4.autoApproveLabel")}
            </label>

            <Field label={t("step4.sharePolicyLabel")}>
              <div className="flex gap-2">
                <ToggleButton
                  active={data.sharePolicy === "all"}
                  onClick={() => update("sharePolicy", "all")}
                >
                  {t("step4.sharePolicyAll")}
                </ToggleButton>
                <ToggleButton
                  active={data.sharePolicy === "admins"}
                  onClick={() => update("sharePolicy", "admins")}
                >
                  {t("step4.sharePolicyAdmins")}
                </ToggleButton>
              </div>
            </Field>

            <label className="flex items-center gap-2 text-base text-foreground">
              <input
                type="checkbox"
                checked={data.potEnabled}
                onChange={(e) => update("potEnabled", e.target.checked)}
              />
              {t("step4.potEnabledLabel")}
            </label>

            {data.potEnabled && (
              <>
                <Field label={t("step4.potModeLabel")}>
                  <div className="flex gap-2">
                    <ToggleButton
                      active={data.potMode === "goal"}
                      onClick={() => update("potMode", "goal")}
                    >
                      {t("step4.potModeGoal")}
                    </ToggleButton>
                    <ToggleButton
                      active={data.potMode === "open"}
                      onClick={() => update("potMode", "open")}
                    >
                      {t("step4.potModeOpen")}
                    </ToggleButton>
                  </div>
                </Field>
                {data.potMode === "goal" && (
                  <Field label={t("step4.potGoalLabel")}>
                    <input
                      type="number"
                      min={1}
                      value={data.potGoalEuros}
                      onChange={(e) => update("potGoalEuros", e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                )}
                <Field label={t("step4.potLabelLabel")}>
                  <input
                    type="text"
                    value={data.potLabel}
                    onChange={(e) => update("potLabel", e.target.value)}
                    placeholder={t("step4.potLabelPlaceholder")}
                    className={inputClass}
                  />
                </Field>
              </>
            )}
          </div>
        )}
      </Card>

      {error && (
        <p role="alert" className="text-center text-sm text-accent-coral">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {step > 1 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            {t("back")}
          </Button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-3">
          {step < TOTAL_STEPS ? (
            <Button
              className="h-11"
              onClick={() => canAdvance() && setStep((s) => s + 1)}
              disabled={!canAdvance()}
            >
              {t("next")}
            </Button>
          ) : (
            <Button className="h-11" onClick={handleSubmit} disabled={isPending}>
              {isPending
                ? t(isEditMode ? "submittingEdit" : "submitting")
                : t(isEditMode ? "submitEdit" : "submit")}
            </Button>
          )}
          {/* Croix rouge pour quitter le wizard sans enregistrer, demande de
              Thomas ("à côté de suivant et enregistrer, je veux une croix
              dans une bulle rouge et ça ramène à l'accueil") : uniquement en
              édition, où "l'accueil" (la page événement) existe déjà -- en
              création, l'événement n'existe pas encore tant que le wizard
              n'est pas soumis, quitter n'aurait nulle part de sensé où aller. */}
          {isEditMode && shortCode && (
            <Link
              href={`/e/${shortCode}`}
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
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// referenceDate = date de la fête si elle est connue, sinon l'année en cours
// (cas fréquent : la fête a lieu avant ou après la date exacte de naissance).
function computeBirthdayAge(birthdayDate: string, referenceDate: string): number | null {
  const birthYear = Number(birthdayDate.slice(0, 4));
  if (!birthdayDate || !birthYear) return null;
  const referenceYear = referenceDate ? Number(referenceDate.slice(0, 4)) : new Date().getFullYear();
  const age = referenceYear - birthYear;
  return age > 0 ? age : null;
}

const inputClass =
  "w-full rounded-konfeti border border-border bg-surface px-4 py-2.5 text-base text-foreground placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-left">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-border bg-surface text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
