export type UnreadMessageMeta = { rsvpId: string | null };

/**
 * Compte les messages "non-lus" parmi un ensemble déjà filtré sur la
 * fenêtre temporelle pertinente (`created_at > chat_reads.last_read_at`,
 * filtre fait côté requête SQL) : reste seulement à exclure les messages
 * que le viewer a lui-même envoyés (on ne veut jamais lui signaler ses
 * propres messages comme "non-lus"). Fonction pure, réutilisée à la fois
 * pour le calcul initial (serveur) et l'incrément en direct (Realtime,
 * client) sur la même règle.
 */
export function computeUnreadCount(
  messages: UnreadMessageMeta[],
  viewerRsvpId: string | null,
): number {
  return messages.filter((m) => m.rsvpId !== viewerRsvpId).length;
}
