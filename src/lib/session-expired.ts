// Petit bus d'événements DOM, pas de contexte React : des dizaines de
// composants disséminés dans l'arbre (chat, participants, sondages, qui
// apporte quoi, cagnotte...) doivent pouvoir signaler "session expirée" à un
// unique bandeau global monté une fois dans le layout, sans avoir à le faire
// remonter par props ni ajouter un Provider à toute l'app pour un seul cas.
const EVENT_NAME = "konfeti:session-expired";

export function notifySessionExpired(): void {
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeSessionExpired(callback: () => void): () => void {
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
