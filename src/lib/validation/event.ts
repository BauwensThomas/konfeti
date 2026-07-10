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

  // Écran 5 : ce que voient les bénéficiaires (brief 1.4 + retour Thomas).
  // "backstage" masque le fil Coulisses, "chat" masque le chat GÉNÉRAL
  // (canal 'main') -- ajouté après coup (retour Thomas : un bénéficiaire
  // masqué de la liste Personnes restait quand même visible comme auteur
  // de messages dans le chat général, d'où le besoin de pouvoir aussi
  // masquer ce canal-là si l'organisateur le souhaite).
  beneficiaryHiddenBlocks: z
    .array(z.enum(["pot", "backstage", "chat", "bring", "polls", "playlist", "participants"]))
    .default([]),
});

type EventFields = z.infer<typeof eventFieldsSchema>;

// `skipPastDateCheck` : un événement DÉJÀ passé doit rester modifiable
// (corriger une coquille sur un événement terminé), donc cette contrainte ne
// s'applique jamais à la création, et seulement à l'édition d'un événement
// dont la date ACTUELLEMENT enregistrée est déjà passée (calculé par
// l'appelant, voir `updateEvent` dans actions/events.ts). Bug réel corrigé
// (retour Thomas) : ce drapeau était auparavant `true` pour TOUTE édition,
// ce qui permettait aussi de faire reculer un événement encore à venir vers
// le passé, pas seulement de corriger un événement déjà terminé.
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
  // Bug réel signalé par Thomas ("j'ai réussi... à mettre la date limite
  // aussi avant la date actuelle") : cette contrainte ne comparait jusqu'ici
  // la date limite qu'à `startsAt` (jamais après), jamais à "maintenant" —
  // une date limite dans le passé passait donc sans problème tant qu'elle
  // restait avant l'événement (les deux pouvant être dans le passé à la fois).
  // Comparaison en dates civiles (comme `isEventFinished`), pas en horodatage
  // exact : `rsvpDeadline` est un champ `<input type="date">` (pas d'heure),
  // qui se parse à minuit — le comparer à l'heure exacte actuelle aurait
  // rejeté à tort la journée du jour même dès qu'il n'est plus minuit pile.
  if (!skipPastDateCheck && data.rsvpDeadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(data.rsvpDeadline) < today) {
      ctx.addIssue({
        code: "custom",
        message: "rsvpDeadline ne peut pas être dans le passé",
        path: ["rsvpDeadline"],
      });
    }
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

// `skipPastDateCheck` calculé dynamiquement par l'appelant (voir plus haut) :
// vrai seulement si l'événement est DÉJÀ passé avant cette modification.
export function updateEventSchema(skipPastDateCheck: boolean) {
  return eventFieldsSchema.superRefine((data, ctx) =>
    refineEventFields(data, ctx, { skipPastDateCheck }),
  );
}

export type CreateEventInput = z.infer<typeof createEventSchema>;
