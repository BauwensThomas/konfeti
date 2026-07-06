import { z } from "zod";

export const OCCASIONS = [
  "birthday",
  "housewarming",
  "bachelor",
  "bbq",
  "aperitif",
  "new_year",
  "other",
] as const;

const eventFieldsSchema = z.object({
  // Écran 1 : l'essentiel
  title: z.string().trim().min(1).max(200),
  theme: z.string().trim().min(1),
  dateMode: z.enum(["fixed", "poll"]),
  startsAt: z.string().trim().optional(),
  endsAt: z.string().trim().optional(),
  dateOptions: z
    .array(z.object({ startsAt: z.string().trim().min(1), label: z.string().trim().optional() }))
    .min(2)
    .max(5)
    .optional(),
  locationText: z.string().trim().min(1).max(300),
  coverPhotoPath: z.string().trim().optional(),

  // Écran 2 : l'occasion
  occasion: z.enum(OCCASIONS),
  birthdayPerson: z.string().trim().optional(),
  birthdayDate: z.string().trim().optional(),
  birthdayAge: z.coerce.number().int().positive().optional(),
  showAge: z.boolean().default(true),
  housewarmingHosts: z.array(z.string().trim().min(1)).optional(),
  bachelorPerson: z.string().trim().optional(),
  description: z.string().trim().max(2000).optional(),

  // Écran 3 : consignes
  instructions: z.string().trim().max(2000).optional(),
  dressCode: z.string().trim().max(200).optional(),
  bringGeneral: z.string().trim().max(500).optional(),
  rsvpDeadline: z.string().trim().optional(),
  kidsAllowed: z.enum(["yes", "no", "details"]).optional(),
  petsAllowed: z.enum(["yes", "no", "details"]).optional(),

  // Écran 4 : extras
  maxGuests: z.coerce.number().int().positive().optional(),
  allowCompanions: z.boolean().default(true),
  autoApprove: z.boolean().default(false),
  sharePolicy: z.enum(["all", "admins"]).default("all"),
  potEnabled: z.boolean().default(false),
  potMode: z.enum(["goal", "open"]).default("goal"),
  potGoalCents: z.coerce.number().int().positive().optional(),
  potLabel: z.string().trim().max(200).optional(),
});

type EventFields = z.infer<typeof eventFieldsSchema>;

// `skipPastDateCheck` : en modification, un événement déjà passé doit rester
// modifiable (corriger une coquille sur un événement terminé), donc on
// n'applique la contrainte "pas de date passée" qu'à la création.
function refineEventFields(
  data: EventFields,
  ctx: z.RefinementCtx,
  { skipPastDateCheck = false } = {},
) {
  if (data.dateMode === "fixed" && !data.startsAt) {
    ctx.addIssue({
      code: "custom",
      message: "startsAt requis quand dateMode = fixed",
      path: ["startsAt"],
    });
  }
  if (data.dateMode === "poll" && (!data.dateOptions || data.dateOptions.length < 2)) {
    ctx.addIssue({
      code: "custom",
      message: "dateOptions requiert au moins 2 dates quand dateMode = poll",
      path: ["dateOptions"],
    });
  }
  if (
    !skipPastDateCheck &&
    data.dateMode === "fixed" &&
    data.startsAt &&
    new Date(data.startsAt) < new Date()
  ) {
    ctx.addIssue({
      code: "custom",
      message: "startsAt ne peut pas être dans le passé",
      path: ["startsAt"],
    });
  }
  if (!skipPastDateCheck && data.dateMode === "poll" && data.dateOptions) {
    data.dateOptions.forEach((option, index) => {
      if (new Date(option.startsAt) < new Date()) {
        ctx.addIssue({
          code: "custom",
          message: "dateOptions ne peut pas contenir de date dans le passé",
          path: ["dateOptions", index, "startsAt"],
        });
      }
    });
  }
  if (data.potEnabled && data.potMode === "goal" && !data.potGoalCents) {
    ctx.addIssue({
      code: "custom",
      message: "potGoalCents requis pour une cagnotte à objectif",
      path: ["potGoalCents"],
    });
  }
  if (
    data.dateMode === "fixed" &&
    data.startsAt &&
    data.rsvpDeadline &&
    new Date(data.rsvpDeadline) > new Date(data.startsAt)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "rsvpDeadline ne peut pas être après startsAt",
      path: ["rsvpDeadline"],
    });
  }
}

export const createEventSchema = eventFieldsSchema.superRefine((data, ctx) =>
  refineEventFields(data, ctx),
);

export const updateEventSchema = eventFieldsSchema.superRefine((data, ctx) =>
  refineEventFields(data, ctx, { skipPastDateCheck: true }),
);

export type CreateEventInput = z.infer<typeof createEventSchema>;
