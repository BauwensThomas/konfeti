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
};

export type ChatReactionSummary = {
  stickerId: string;
  count: number;
  reactedByMe: boolean;
};
