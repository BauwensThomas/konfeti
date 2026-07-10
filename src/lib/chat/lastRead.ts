// Persiste la dernière lecture du chat CÔTÉ CLIENT, par onglet navigateur
// (sessionStorage) : le panneau de chat (ChatRoom) se démonte/remonte à
// chaque changement d'onglet (voir EventTabs), et `initialLastReadAt`
// (calculé par le Server Component EventChat) reste figé à la valeur du
// dernier VRAI chargement de page tant qu'on ne recharge pas -- un Server
// Component ne se reconstruit pas à un changement d'onglet purement client.
// Sans ce relais, revenir sur l'onglet Chat après être passé par
// Accueil/Personnes/Participer réaffichait la ligne "messages non lus" au
// même endroit alors que ces messages venaient tout juste d'être marqués lus
// (retour Thomas : "message non lu reste toujours affiché au même endroit").
function storageKey(eventId: string) {
  return `konfeti-chat-last-read:${eventId}`;
}

export function readSessionLastReadAt(eventId: string): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(storageKey(eventId));
}

export function writeSessionLastReadAt(eventId: string, iso: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(storageKey(eventId), iso);
}
