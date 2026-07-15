// "Infos pratiques pour venir" (brief 4.6) : les deep links Uber/Bolt
// "pré-remplis" n'ont de sens que la nuit (le brief : "après minuit") -- le
// reste de la journée, Maps/Waze/transports en commun suffisent. Basé sur
// l'heure RÉELLE au moment où quelqu'un regarde la page (c'est là qu'il
// commanderait la course), pas sur l'heure de début de l'événement lui-même
// -- `now` injectable pour les tests, même convention que `isJourJ`.
export function isAfterMidnightContext(now: Date = new Date()): boolean {
  const hour = now.getHours();
  return hour >= 0 && hour < 6;
}
