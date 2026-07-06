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
