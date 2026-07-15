export type ChatMessageView = {
  id: string;
  channel: "main" | "backstage";
  body: string | null;
  photoUrl: string | null;
  replyTo: string | null;
  isSystem: boolean;
  deletedByAdmin: boolean;
  createdAt: string;
  rsvpId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  // Retour Thomas : "je veux juste 1x elle a rejoint et si elle quitte X a
  // quitté" -- pour un message système ("joined"/"left") uniquement, le nom
  // FIGÉ au moment de l'événement (jamais résolu en direct comme
  // `authorName`, qui lui doit rester à jour pour les VRAIS messages).
  // `null` pour un message normal.
  systemAuthorName: string | null;
  // Absent (`undefined`) pour un message déjà confirmé par le serveur (le cas
  // normal, chargé depuis la base ou reçu par Realtime). "sending" ne
  // concerne que la bulle optimiste ajoutée localement avant la réponse du
  // serveur (voir ChatRoom.handleOptimisticSend) — jamais persisté. En cas
  // d'échec, la bulle optimiste est retirée (pas de statut "failed" séparé :
  // le texte revient dans le composer et le bandeau d'erreur existant
  // explique déjà quoi faire, voir MessageComposer).
  status?: "sending";
};

export type ChatReactionSummary = {
  stickerId: string;
  count: number;
  reactedByMe: boolean;
};
