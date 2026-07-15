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
import { toLocalDateTimeValue, fromLocalDateTimeValue, parseDateOnlyLocal } from "@/lib/datetime";
import { joinNames } from "@/lib/joinNames";
import { UnitPickerButton, type BringUnit } from "@/components/bring/UnitPickerButton";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { RestaurantPollPicker } from "@/components/RestaurantPollPicker";

type DateOption = { startsAt: string; label: string };

export type WizardData = {
  title: string;
  theme: string;
  dateMode: "fixed" | "poll";
  startsAt: string;
  endsAt: string;
  dateOptions: DateOption[];
  locationText: string;
  // Météo (brief 4.6) : renseignés UNIQUEMENT quand l'organisateur choisit
  // une vraie suggestion dans `LocationAutocomplete` (jamais par un
  // géocodage serveur séparé) -- `null` tant qu'il tape un texte libre non
  // sélectionné, la météo ne s'affichera simplement pas dans ce cas.
  locationLat: number | null;
  locationLng: number | null;
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
  potCloseAtGoal: boolean;
  bringItems: BringItemRow[];
  polls: PollRow[];
  beneficiaryHiddenBlocks: BeneficiaryBlock[];
};

export type BeneficiaryBlock = "pot" | "backstage" | "chat" | "bring" | "polls" | "playlist" | "participants";

// "Qui apporte quoi" (brief 4.4) : `id` reste `null` pour une ligne ajoutée
// dans cette session du wizard (pas encore en base) -- distingué en édition
// des items déjà existants, pour que createEvent/updateEvent puisse
// synchroniser par diff plutôt que tout recréer (voir DECISIONS.md).
// `quantityNeeded` en texte comme `potGoalEuros` (état de champ contrôlé),
// converti en nombre à la soumission. `unit` accepte aussi `""` (retour
// Thomas : "avant qu'il s'ouvre ça doit être écrit choisir..." -- une
// nouvelle ligne ne doit pas silencieusement défaulter sur "Pièce", le popup
// doit d'abord afficher un placeholder tant que l'organisateur n'a rien
// choisi lui-même). Filtré à la soumission comme un libellé vide.
export type BringItemRow = {
  id: string | null;
  label: string;
  unit: BringUnit | "";
  quantityNeeded: string;
};

// Sondages (brief : "Sondage(s) optionnel(s)") : même convention `id: null`
// que `BringItemRow` -- une option sans id n'existe pas encore en base.
export type PollOptionRow = { id: string | null; label: string; externalUrl: string | null };
// "Choix unique" (menu resto...) vs "choix multiple" (comportement
// historique, valeur par défaut) -- retour Thomas, voir migration
// `polls_choice_mode_and_quantity`.
export type PollRow = {
  id: string | null;
  question: string;
  kind: "custom" | "restaurant";
  options: PollOptionRow[];
  choiceMode: "single" | "multiple";
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
  locationLat: null,
  locationLng: null,
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
  potCloseAtGoal: false,
  bringItems: [],
  polls: [],
  // Cagnotte + Coulisses masquées par défaut (préserve le comportement
  // historique de ces deux blocs, "toujours masqués", avant qu'ils ne
  // deviennent configurables ici) ; le chat GÉNÉRAL et le reste restent
  // visibles par défaut, comme aujourd'hui.
  beneficiaryHiddenBlocks: ["pot", "backstage"],
};

const TOTAL_STEPS = 5;

type CreateEventWizardProps = {
  eventId?: string;
  shortCode?: string;
  initialData?: WizardData;
  initialPhotoUrl?: string | null;
  // Prénoms des bénéficiaires déjà approuvés (édition seulement — à la
  // création, l'événement n'a encore aucun participant, ce tableau reste
  // vide et les phrases de l'étape 5 restent génériques).
  beneficiaryNames?: string[];
};

export function CreateEventWizard({
  eventId,
  shortCode,
  initialData,
  initialPhotoUrl,
  beneficiaryNames = [],
}: CreateEventWizardProps) {
  const isEditMode = !!eventId;
  const t = useTranslations("CreateEvent");
  const tThemes = useTranslations("Themes");
  const tOccasions = useTranslations("Occasions");
  // `UnitPickerButton` est volontairement indépendant de next-intl (voir ce
  // fichier) : les libellés lui sont passés tout traduits.
  const bringUnitLabels: Record<BringUnit, string> = {
    piece: t("step4.bringUnit.piece"),
    liter: t("step4.bringUnit.liter"),
    gram: t("step4.bringUnit.gram"),
    kilogram: t("step4.bringUnit.kilogram"),
  };
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
  // Même demande de Thomas, étendue à "Enfants bienvenus"/"Animaux bienvenus"
  // (retour Thomas : "il va falloir aussi mettre des popup pour enfants
  // bienvenus et animaux bienvenus") -- même pattern popup que l'unité
  // ci-dessus, plus besoin d'un `<select>` natif pour ces deux champs.
  const [kidsPickerOpen, setKidsPickerOpen] = useState(false);
  const [petsPickerOpen, setPetsPickerOpen] = useState(false);
  // Retour Thomas, généralisé : "tout ceux où il y a un menu qu'on déroule
  // doit être avec un popup" -- dernier `<select>` natif restant (occasion).
  const [occasionPickerOpen, setOccasionPickerOpen] = useState(false);

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  // Étape 5 : bascule un bloc dans/hors de `beneficiaryHiddenBlocks` (coché
  // = masqué aux bénéficiaires).
  function toggleBeneficiaryBlock(block: BeneficiaryBlock) {
    setData((prev) => ({
      ...prev,
      beneficiaryHiddenBlocks: prev.beneficiaryHiddenBlocks.includes(block)
        ? prev.beneficiaryHiddenBlocks.filter((b) => b !== block)
        : [...prev.beneficiaryHiddenBlocks, block],
    }));
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
    parseDateOnlyLocal(data.rsvpDeadline) > new Date(data.startsAt);
  // Comparaison en dates civiles, pas en horodatage exact : ce champ est un
  // `<input type="date">` (pas d'heure), qui se parse à minuit -- le comparer
  // à l'heure exacte actuelle rejetterait à tort la journée du jour même dès
  // qu'il n'est plus minuit pile (même raison que côté serveur).
  // `parseDateOnlyLocal` (pas `new Date(...)` direct) : bug réel, une chaîne
  // date-only se parse toujours en UTC, jamais dans le fuseau local -- "hier"
  // en UTC pendant les ~2 premières heures après minuit heure locale (été,
  // Belgique UTC+2), rejetant à tort la date du jour même comme "passée".
  const rsvpDeadlineInPast = (() => {
    if (originalAlreadyPast || !data.rsvpDeadline) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parseDateOnlyLocal(data.rsvpDeadline) < today;
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
        startsAt: data.dateMode === "fixed" ? fromLocalDateTimeValue(data.startsAt) : undefined,
        endsAt: data.endsAt ? fromLocalDateTimeValue(data.endsAt) : undefined,
        dateOptions:
          data.dateMode === "poll"
            ? data.dateOptions
                .filter((o) => o.startsAt)
                .map((o) => ({ startsAt: fromLocalDateTimeValue(o.startsAt), label: o.label || undefined }))
            : undefined,
        locationText: data.locationText,
        locationLat: data.locationLat,
        locationLng: data.locationLng,
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
        potCloseAtGoal: data.potEnabled && data.potMode === "goal" ? data.potCloseAtGoal : false,
        bringItems: data.bringItems
          .filter((item) => item.label.trim() && item.quantityNeeded && item.unit)
          .map((item) => ({
            id: item.id,
            label: item.label.trim(),
            unit: item.unit as BringUnit,
            quantityNeeded: Number(item.quantityNeeded),
          })),
        // Sondages : sondage sans question ou avec moins de 2 options
        // valides retiré entièrement (comme un item "qui apporte quoi" sans
        // libellé) -- une option vide ne compte jamais.
        polls: data.polls
          .map((poll) => ({
            id: poll.id,
            question: poll.question.trim(),
            kind: poll.kind,
            options: poll.options
              .filter((option) => option.label.trim())
              .map((option) => ({ id: option.id, label: option.label.trim(), externalUrl: option.externalUrl })),
            choiceMode: poll.choiceMode,
          }))
          .filter((poll) => poll.question && poll.options.length >= 2),
        beneficiaryHiddenBlocks: data.beneficiaryHiddenBlocks,
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
              <LocationAutocomplete
                value={data.locationText}
                onChange={(text, coords) => {
                  update("locationText", text);
                  update("locationLat", coords?.lat ?? null);
                  update("locationLng", coords?.lng ?? null);
                }}
                placeholder={t("step1.locationPlaceholder")}
                ariaLabel={t("step1.locationLabel")}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-xl text-foreground">{t("step2.heading")}</h2>

            <Field label={t("step2.occasionLabel")}>
              <button
                type="button"
                onClick={() => setOccasionPickerOpen(true)}
                className={`${inputClass} text-left`}
              >
                {tOccasions(data.occasion)}
              </button>
            </Field>

            <Modal open={occasionPickerOpen} onClose={() => setOccasionPickerOpen(false)}>
              <div className="flex flex-col gap-1">
                {OCCASIONS.map((occasion) => (
                  <button
                    key={occasion}
                    type="button"
                    onClick={() => {
                      update("occasion", occasion);
                      setOccasionPickerOpen(false);
                    }}
                    className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
                  >
                    {tOccasions(occasion)}
                  </button>
                ))}
              </div>
            </Modal>

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

            {/* Retour Thomas : "il va falloir aussi mettre des popup pour
                enfants bienvenus et animaux bienvenus" -- même pattern
                popup que le choix d'unité "qui apporte quoi", `<select>`
                natif retiré. */}
            <Field label={t("step3.kidsAllowedLabel")}>
              <button
                type="button"
                onClick={() => setKidsPickerOpen(true)}
                className={`${inputClass} text-left`}
              >
                {data.kidsAllowed ? t(`step3.${data.kidsAllowed}`) : t("step3.choosePlaceholder")}
              </button>
            </Field>

            <Field label={t("step3.petsAllowedLabel")}>
              <button
                type="button"
                onClick={() => setPetsPickerOpen(true)}
                className={`${inputClass} text-left`}
              >
                {data.petsAllowed ? t(`step3.${data.petsAllowed}`) : t("step3.choosePlaceholder")}
              </button>
            </Field>

            <Modal open={kidsPickerOpen} onClose={() => setKidsPickerOpen(false)}>
              <div className="flex flex-col gap-1">
                {(["yes", "no", "details"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      update("kidsAllowed", value);
                      setKidsPickerOpen(false);
                    }}
                    className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
                  >
                    {t(`step3.${value}`)}
                  </button>
                ))}
              </div>
            </Modal>

            <Modal open={petsPickerOpen} onClose={() => setPetsPickerOpen(false)}>
              <div className="flex flex-col gap-1">
                {(["yes", "no", "details"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      update("petsAllowed", value);
                      setPetsPickerOpen(false);
                    }}
                    className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
                  >
                    {t(`step3.${value}`)}
                  </button>
                ))}
              </div>
            </Modal>
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
                  <>
                    <Field label={t("step4.potGoalLabel")}>
                      <input
                        type="number"
                        min={1}
                        value={data.potGoalEuros}
                        onChange={(e) => update("potGoalEuros", e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-base text-foreground">
                      <input
                        type="checkbox"
                        checked={data.potCloseAtGoal}
                        onChange={(e) => update("potCloseAtGoal", e.target.checked)}
                      />
                      {t("step4.potCloseAtGoalLabel")}
                    </label>
                  </>
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

            {/* "Qui apporte quoi" (brief 4.4, Phase 6) : retour Thomas,
                "l'organisateur doit pouvoir mettre lui-même le nom (alcool,
                dessert, soft, bonbon etc..) et pouvoir choisir litres,
                gramme, kilo ou quantité" -- champ libre, pas de catégories
                préremplies. Même pattern répétable que housewarmingHosts
                ci-dessus, mais trois champs par ligne. */}
            <Field label={t("step4.bringItemsLabel")}>
              <div className="flex flex-col gap-3">
                {data.bringItems.map((item, index) => (
                  <div key={index} className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => {
                        const next = [...data.bringItems];
                        next[index] = { ...next[index], label: e.target.value };
                        update("bringItems", next);
                      }}
                      placeholder={t("step4.bringItemLabelPlaceholder")}
                      aria-label={t("step4.bringItemLabelAria", { index: index + 1 })}
                      className={inputClass}
                    />
                    {/* Retour Thomas, en plusieurs passes : d'abord un menu
                        (pas 4 boutons qui passaient à la ligne sur mobile),
                        puis "le cadre avec le nombre doit être la moitié et
                        l'autre moitié le bouton pour choisir le type... il
                        faut que ça ouvre un popup" -- moitié/moitié
                        (`flex-1` sur les deux), et un vrai `Modal fitContent`
                        (même pattern que EmojiPicker) au lieu d'un `<select>`
                        natif. */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.quantityNeeded}
                        onChange={(e) => {
                          const next = [...data.bringItems];
                          next[index] = { ...next[index], quantityNeeded: e.target.value };
                          update("bringItems", next);
                        }}
                        aria-label={t("step4.bringItemQuantityAria", { index: index + 1 })}
                        className={`${inputClass} flex-1`}
                      />
                      <UnitPickerButton
                        value={item.unit}
                        onChange={(unit) => {
                          const next = [...data.bringItems];
                          next[index] = { ...next[index], unit };
                          update("bringItems", next);
                        }}
                        unitLabels={bringUnitLabels}
                        placeholder={t("step3.choosePlaceholder")}
                        ariaLabel={t("step4.bringItemUnitAria", { index: index + 1 })}
                        className={`${inputClass} flex-1 text-left`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => update("bringItems", data.bringItems.filter((_, i) => i !== index))}
                      className="self-start text-sm text-accent-coral"
                    >
                      {t("step4.removeBringItem")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    update("bringItems", [
                      ...data.bringItems,
                      { id: null, label: "", unit: "", quantityNeeded: "" },
                    ])
                  }
                  className="text-sm font-semibold text-primary"
                >
                  + {t("step4.addBringItem")}
                </button>
              </div>
            </Field>

            {/* Sondages (brief : "Sondage(s) optionnel(s)") : même pattern
                répétable à deux niveaux (sondage -> options), une nouvelle
                ligne de sondage démarre déjà avec 2 options vides (jamais
                moins de 2 affichées, le bouton "Retirer" d'une option
                disparaît en dessous de ce seuil). */}
            <Field label={t("step4.pollsLabel")}>
              <div className="flex flex-col gap-3">
                {data.polls.map((poll, pollIndex) => (
                  <div key={pollIndex} className="flex flex-col gap-2 rounded-konfeti border border-border p-3">
                    <input
                      type="text"
                      value={poll.question}
                      onChange={(e) => {
                        const next = [...data.polls];
                        next[pollIndex] = { ...next[pollIndex], question: e.target.value };
                        update("polls", next);
                      }}
                      placeholder={t("step4.pollQuestionPlaceholder")}
                      aria-label={t("step4.pollQuestionAria", { index: pollIndex + 1 })}
                      className={inputClass}
                    />
                    {/* "Choix unique" (menu resto...) vs "choix multiple"
                        (retour Thomas : "je sais voter pour les 3... j'ai le
                        droit qu'à un menu"). */}
                    <div className="flex gap-2">
                      <ToggleButton
                        active={poll.choiceMode === "multiple"}
                        onClick={() => {
                          const next = [...data.polls];
                          next[pollIndex] = { ...next[pollIndex], choiceMode: "multiple" };
                          update("polls", next);
                        }}
                      >
                        {t("step4.pollChoiceModeMultiple")}
                      </ToggleButton>
                      <ToggleButton
                        active={poll.choiceMode === "single"}
                        onClick={() => {
                          const next = [...data.polls];
                          next[pollIndex] = { ...next[pollIndex], choiceMode: "single" };
                          update("polls", next);
                        }}
                      >
                        {t("step4.pollChoiceModeSingle")}
                      </ToggleButton>
                    </div>
                    {/* Sondage resto (brief V1.1) : options peuplées depuis
                        Google Places au lieu de texte libre. */}
                    <div className="flex gap-2">
                      <ToggleButton
                        active={poll.kind === "custom"}
                        onClick={() => {
                          const next = [...data.polls];
                          next[pollIndex] = { ...next[pollIndex], kind: "custom" };
                          update("polls", next);
                        }}
                      >
                        {t("step4.pollKindCustom")}
                      </ToggleButton>
                      <ToggleButton
                        active={poll.kind === "restaurant"}
                        onClick={() => {
                          const next = [...data.polls];
                          next[pollIndex] = { ...next[pollIndex], kind: "restaurant" };
                          update("polls", next);
                        }}
                      >
                        {t("step4.pollKindRestaurant")}
                      </ToggleButton>
                    </div>
                    {poll.kind === "restaurant" ? (
                      <RestaurantPollPicker
                        locationLat={data.locationLat}
                        locationLng={data.locationLng}
                        selectedOptions={poll.options.filter((o) => o.label.trim().length > 0)}
                        onOptionsChange={(options) => {
                          const next = [...data.polls];
                          next[pollIndex] = { ...next[pollIndex], options };
                          update("polls", next);
                        }}
                      />
                    ) : (
                    <div className="flex flex-col gap-2">
                      {poll.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={option.label}
                            onChange={(e) => {
                              const next = [...data.polls];
                              const nextOptions = [...next[pollIndex].options];
                              nextOptions[optionIndex] = { ...nextOptions[optionIndex], label: e.target.value };
                              next[pollIndex] = { ...next[pollIndex], options: nextOptions };
                              update("polls", next);
                            }}
                            placeholder={t("step4.pollOptionPlaceholder")}
                            aria-label={t("step4.pollOptionAria", {
                              pollIndex: pollIndex + 1,
                              optionIndex: optionIndex + 1,
                            })}
                            className={`${inputClass} flex-1`}
                          />
                          {poll.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...data.polls];
                                next[pollIndex] = {
                                  ...next[pollIndex],
                                  options: next[pollIndex].options.filter((_, i) => i !== optionIndex),
                                };
                                update("polls", next);
                              }}
                              className="text-xs font-semibold text-accent-coral"
                            >
                              {t("step4.removePollOption")}
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...data.polls];
                          next[pollIndex] = {
                            ...next[pollIndex],
                            options: [...next[pollIndex].options, { id: null, label: "", externalUrl: null }],
                          };
                          update("polls", next);
                        }}
                        className="self-start text-xs font-semibold text-primary"
                      >
                        + {t("step4.addPollOption")}
                      </button>
                    </div>
                    )}
                    <button
                      type="button"
                      onClick={() => update("polls", data.polls.filter((_, i) => i !== pollIndex))}
                      className="self-start text-sm text-accent-coral"
                    >
                      {t("step4.removePoll")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    update("polls", [
                      ...data.polls,
                      {
                        id: null,
                        question: "",
                        kind: "custom",
                        options: [
                          { id: null, label: "", externalUrl: null },
                          { id: null, label: "", externalUrl: null },
                        ],
                        choiceMode: "multiple",
                      },
                    ])
                  }
                  className="text-sm font-semibold text-primary"
                >
                  + {t("step4.addPoll")}
                </button>
              </div>
            </Field>
          </div>
        )}

        {/* Étape 5 : ce que voient les bénéficiaires (retour Thomas : "il
            faut une étape 5... avec le ou les bénéficiaires peuvent voir la
            cagnotte, le chat, les personnes, qui apporte quoi etc."). La
            cagnotte et les deux canaux de chat (Général/Coulisses) étaient
            jusqu'ici codés en dur -- ils deviennent des cases à cocher comme
            le reste. Les deux onglets Général/Coulisses restent TOUJOURS
            visibles pour tous, y compris le bénéficiaire bloqué, qui voit
            juste "vous n'avez pas accès" en ouvrant l'onglet concerné (retour
            Thomas : "il faut toujours laisser coulisse et général... mais
            s'il clique dessus, il faut dire vous avez pas accès") -- voir
            ChatRoom.tsx pour ce placeholder + la bannière montrée aux
            autres. Le chat GÉNÉRAL a été ajouté à cette liste après coup
            (retour Thomas, en repensant au masquage de la liste Personnes :
            "rajouter une possibilité de masquer le chat général pour les
            bénéficiaires" -- sinon un bénéficiaire masqué de Personnes reste
            quand même visible comme auteur de messages dans le chat
            général). Un court texte d'aide (avantage/inconvénient) accompagne
            chaque case, pour que l'organisateur choisisse en connaissance de
            cause. `beneficiaryNames` est vide à la création (aucun
            participant n'existe encore) : la phrase reste alors générique
            ("Aucun bénéficiaire n'a accès..."), ce qui reste factuellement
            correct dans ce cas aussi. */}
        {step === 5 && (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-xl text-foreground">{t("step5.heading")}</h2>
            <p className="text-sm text-foreground/70">{t("step5.intro")}</p>

            {BENEFICIARY_BLOCKS.map((block) => {
              const hidden = data.beneficiaryHiddenBlocks.includes(block);
              // Masqué => personne n'y a accès, quel que soit le nombre de
              // bénéficiaires déjà approuvés (le toggle prime toujours).
              const namesWithAccess = hidden ? [] : beneficiaryNames;
              return (
                <div
                  key={block}
                  className="flex flex-col gap-1.5 rounded-konfeti border border-border p-3"
                >
                  <label className="flex items-center gap-2 text-base text-foreground">
                    <input
                      type="checkbox"
                      checked={hidden}
                      onChange={() => toggleBeneficiaryBlock(block)}
                    />
                    {t("step5.hideLabel", { block: t(`step5.blocks.${block}.label`) })}
                  </label>
                  <p className={`text-xs font-semibold ${hidden ? "text-accent-coral" : "text-accent-mint"}`}>
                    {t("step5.visibilitySummary", {
                      count: namesWithAccess.length,
                      names: joinNames(namesWithAccess),
                      block: t(`step5.blocks.${block}.withAccess`),
                    })}
                  </p>
                  <p className="text-xs leading-snug text-foreground/70">
                    {t(`step5.blocks.${block}.hintPro`)}
                    <br />
                    {t(`step5.blocks.${block}.hintCon`)}
                  </p>
                </div>
              );
            })}
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

// Ordre d'affichage de l'étape 5 (checkbox "Masquer X aux bénéficiaires" +
// phrase dynamique).
const BENEFICIARY_BLOCKS: BeneficiaryBlock[] = [
  "pot",
  "backstage",
  "chat",
  "bring",
  "polls",
  "playlist",
  "participants",
];

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
