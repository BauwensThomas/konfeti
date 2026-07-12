/**
 * Format attendu par un input datetime-local : "YYYY-MM-DDTHH:mm" en heure
 * locale (surtout pas toISOString(), qui convertit en UTC et décale l'heure).
 * Utilisé à la fois pour poser un `min` (empêcher une date passée) et pour
 * pré-remplir le formulaire de modification avec les valeurs existantes.
 */
export function toLocalDateTimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Inverse de `toLocalDateTimeValue` : convertit la valeur brute d'un input
 * datetime-local (heure locale du navigateur, sans fuseau) en horodatage UTC
 * réel avant l'envoi au serveur. Bug réel signalé par Thomas ("+1 minute"
 * devenait "+2h") : envoyée telle quelle, la chaîne nue est réinterprétée par
 * Postgres dans le fuseau de sa session (UTC), pas celui du navigateur --
 * `new Date(value)` ici utilise le fuseau local du navigateur, le seul qui
 * connaisse l'intention réelle de l'utilisateur.
 */
export function fromLocalDateTimeValue(value: string): string {
  return new Date(value).toISOString();
}

/**
 * Parse une chaîne "YYYY-MM-DD" (valeur d'un input `type="date"`, ex.
 * `rsvpDeadline`) comme minuit en heure LOCALE. Piège du constructeur `Date`
 * natif : une chaîne date-only ("2026-07-12", sans heure) est TOUJOURS
 * interprétée en UTC, jamais dans le fuseau du navigateur/serveur -- comparée
 * à un "aujourd'hui" construit localement (`new Date(); setHours(0,0,0,0)`),
 * la date du jour même paraissait à tort "dans le passé" pendant les ~2
 * premières heures après minuit heure locale (Belgique, UTC+2 l'été) : bug
 * réel, même famille que `fromLocalDateTimeValue` ci-dessus.
 */
export function parseDateOnlyLocal(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(year, month - 1, day);
}
