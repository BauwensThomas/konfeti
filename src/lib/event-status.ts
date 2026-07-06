/**
 * Un événement est considéré "terminé" seulement à partir du lendemain de sa
 * date (jamais le jour même, même si l'heure est déjà passée) : on compare
 * des dates civiles, pas des horodatages. Les événements en sondage de date
 * (`date_mode === "poll"`) n'ont pas de date fixée, donc jamais "terminés".
 */
export function isEventFinished(startsAt: string | null, dateMode: string): boolean {
  if (dateMode !== "fixed" || !startsAt) return false;

  const eventDay = new Date(startsAt);
  eventDay.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return today.getTime() > eventDay.getTime();
}

type EventWithDate = { starts_at: string | null; date_mode: string };

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
    const aFinished = isEventFinished(a.starts_at, a.date_mode);
    const bFinished = isEventFinished(b.starts_at, b.date_mode);
    if (aFinished !== bFinished) return aFinished ? 1 : -1;

    if (!a.starts_at && !b.starts_at) return 0;
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;

    const aTime = new Date(a.starts_at).getTime();
    const bTime = new Date(b.starts_at).getTime();
    return aFinished ? bTime - aTime : aTime - bTime;
  });
}
