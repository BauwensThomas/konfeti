const DAY_MS = 24 * 60 * 60 * 1000;

/** Minuit (heure locale) du jour civil d'une date, en millisecondes. */
function civilDay(date: string | Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Un événement est considéré "terminé" seulement à partir du lendemain de sa
 * date (jamais le jour même, même si l'heure est déjà passée) : on compare
 * des dates civiles, pas des horodatages. Les événements en sondage de date
 * (`date_mode === "poll"`) n'ont pas de date fixée, donc jamais "terminés".
 */
export function isEventFinished(startsAt: string | null, dateMode: string): boolean {
  if (dateMode !== "fixed" || !startsAt) return false;
  return civilDay(new Date()) > civilDay(startsAt);
}

/**
 * Mode Jour J (brief 4.11) : vrai pendant TOUTE la journée civile de
 * l'événement, peu importe l'heure exacte (confirmé avec Thomas : même vue
 * à 9h qu'à 23h, pas de bascule plus fine selon l'heure de début), jusqu'à 2
 * jours de grâce après la FIN de l'événement -- pas juste après le DÉBUT.
 * `endsAt` (champ optionnel du wizard) ancre la vraie durée : sans lui (ou
 * pour une soirée classique, `endsAt` le même jour), le Mode Jour J couvre le
 * jour même + 2 jours (bug réel signalé par Thomas : une fête qui déborde
 * après minuit avait encore besoin du suivi arrivées/"bien rentré" une fois
 * la date civile basculée, le temps de rentrer chez soi sans course contre la
 * montre). Avec un `endsAt` plusieurs jours après `startsAt` (un festival),
 * le Mode Jour J reste actif tout du long (retour Thomas : "si c'est un
 * festival qui dure 5 jours, il va se terminer avant la fin ?") -- jamais
 * juste `startsAt + 2 jours` dans ce cas.
 * `endedAt` (bouton "Terminer", admin) prime sur tout calcul de date :
 * l'admin peut clore le Mode Jour J plus tôt si la fête finit avant l'heure.
 * Même principe de comparaison de dates civiles que `isEventFinished`
 * ci-dessus et `shouldShowWeather` (`src/lib/weather.ts`). `now` injectable
 * pour les tests, même style que `shouldShowWeather`.
 */
export function isJourJ(
  startsAt: string | null,
  dateMode: string,
  endsAt: string | null = null,
  endedAt: string | null = null,
  now: Date = new Date(),
): boolean {
  if (endedAt) return false;
  if (dateMode !== "fixed" || !startsAt) return false;

  const startDay = civilDay(startsAt);
  const endDay = endsAt ? Math.max(civilDay(endsAt), startDay) : startDay;
  // 2 jours de grâce après la fin (retour Thomas) : le temps de rentrer chez
  // soi et de cocher "bien rentré" sans course contre la montre.
  const graceDay = endDay + 2 * DAY_MS;
  const today = civilDay(now);

  return today >= startDay && today <= graceDay;
}

/**
 * "Terminé" côté affichage utilisateur (badge, tri "Mes événements") :
 * seulement une fois le Mode Jour J prolongé (`isJourJ`) lui-même terminé
 * (ou clos manuellement via `endedAt`), pas juste au lendemain civil brut du
 * DÉBUT (`isEventFinished`) -- sinon le badge "Terminé" s'affiche (et
 * l'événement se trie en bas de liste) alors que la carte Jour J (arrivées,
 * "bien rentré") est encore utile. Bugs réels signalés par Thomas : "il faut
 * enlever le terminé dans la bannière aussi", "dans mes événements il doit
 * être marqué en cours et pas terminé". `isEventFinished` garde son sens brut
 * "dès le lendemain du DÉBUT" pour les usages internes (ex. purge des vieux
 * événements) où cet écart n'a pas d'importance.
 */
export function isEventOver(
  startsAt: string | null,
  dateMode: string,
  endsAt: string | null = null,
  endedAt: string | null = null,
): boolean {
  if (endedAt) return true;
  return isEventFinished(startsAt, dateMode) && !isJourJ(startsAt, dateMode, endsAt, endedAt);
}

type EventWithDate = {
  starts_at: string | null;
  date_mode: string;
  ends_at?: string | null;
  ended_at?: string | null;
};

/**
 * Ordre d'affichage dans "Mes événements" : d'abord tous les événements "en
 * cours" (pas encore terminés, la date la plus proche en premier ; ceux sans
 * date fixée (sondage) ferment ce premier groupe, faute d'ordre chronologique
 * sensé), puis tous les événements terminés, du plus récemment terminé au
 * plus ancien. Le statut terminé/en cours est TOUJOURS le critère principal
 * (jamais un événement terminé au-dessus d'un événement en cours), quel que
 * soit son mode de date — bug corrigé le 2026-07-06 : le tri vérifiait la
 * date manquante avant le statut terminé, ce qui faisait remonter un
 * événement terminé au-dessus d'un événement "en cours" sans date (sondage).
 */
export function sortEventsByDate<T extends EventWithDate>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const aFinished = isEventOver(a.starts_at, a.date_mode, a.ends_at ?? null, a.ended_at ?? null);
    const bFinished = isEventOver(b.starts_at, b.date_mode, b.ends_at ?? null, b.ended_at ?? null);
    if (aFinished !== bFinished) return aFinished ? 1 : -1;

    if (!a.starts_at && !b.starts_at) return 0;
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;

    const aTime = new Date(a.starts_at).getTime();
    const bTime = new Date(b.starts_at).getTime();
    return aFinished ? bTime - aTime : aTime - bTime;
  });
}
