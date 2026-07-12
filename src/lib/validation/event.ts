import { z } from "zod";
import { parseDateOnlyLocal } from "@/lib/datetime";

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
  // Météo (brief 4.6) : renseignés seulement si l'organisateur a choisi une
  // vraie suggestion Photon (LocationAutocomplete.tsx), jamais par un
  // géocodage serveur -- `null` sinon, la météo ne s'affiche simplement pas.
  locationLat: z.number().nullable().default(null),
  locationLng: z.number().nullable().default(null),
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

  // "Qui apporte quoi" (brief 4.4, Phase 6) : `id` vaut `null` pour un item
  // pas encore créé (nouvelle ligne ajoutée dans le wizard), sinon l'id réel
  // en base -- utilisé par `eventRowFromInput`/`createEvent`/`updateEvent`
  // pour synchroniser par diff plutôt que tout recréer (voir DECISIONS.md :
  // un delete+reinsert détruirait les engagements déjà pris par les invités).
  bringItems: z
    .array(
      z.object({
        id: z.string().uuid().nullable(),
        label: z.string().trim().min(1).max(200),
        unit: z.enum(["piece", "liter", "gram", "kilogram"]).default("piece"),
        quantityNeeded: z.coerce.number().positive(),
      }),
    )
    .max(30)
    .default([]),

  // Sondages (brief : "Sondage(s) optionnel(s)"), même convention `id: null`
  // = pas encore créé que `bringItems` ci-dessus -- synchronisés par diff
  // (voir `syncPolls`, `actions/events.ts`), toujours `status = 'approved'`
  // (comportement historique d'un sondage défini par l'organisateur, comme
  // les items du wizard).
  polls: z
    .array(
      z.object({
        id: z.string().uuid().nullable(),
        question: z.string().trim().min(1).max(300),
        options: z
          .array(z.object({ id: z.string().uuid().nullable(), label: z.string().trim().min(1).max(200) }))
          .min(2)
          .max(10),
        // "Choix unique" (menu resto...) vs "choix multiple" (comportement
        // historique, valeur par défaut) -- voir migration
        // `polls_choice_mode_and_quantity`.
        choiceMode: z.enum(["single", "multiple"]).default("multiple"),
      }),
    )
    .max(10)
    .default([]),

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
  // `parseDateOnlyLocal` (pas `new Date(...)` direct) : bug réel, une chaîne
  // date-only se parse toujours en UTC, jamais dans le fuseau local -- "hier"
  // en UTC pendant les ~2 premières heures après minuit heure locale (été,
  // Belgique UTC+2), rejetant à tort la date du jour même comme "passée".
  if (!skipPastDateCheck && data.rsvpDeadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parseDateOnlyLocal(data.rsvpDeadline) < today) {
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
    parseDateOnlyLocal(data.rsvpDeadline) > new Date(data.startsAt)
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
export type BringItemInput = CreateEventInput["bringItems"][number];
export type PollInput = CreateEventInput["polls"][number];
