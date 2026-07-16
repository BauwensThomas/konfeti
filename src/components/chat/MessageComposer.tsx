"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { sendMessage } from "@/app/[locale]/actions/chat";
import { uploadMessagePhoto } from "@/app/[locale]/actions/upload";
import type { ChatMessageView } from "@/components/chat/types";

// Brouillon persisté (brief 4.3, retour Thomas : le texte en cours de frappe
// ne doit pas se perdre en changeant d'onglet). Le panneau de chat se
// démonte au changement d'onglet (voir EventTabs) : sessionStorage survit à
// ce démontage/remontage sans avoir à garder tout le panneau monté en
// permanence (ce qui recréait sinon la ligne rsvps de l'hôte en arrière-plan
// à chaque chargement de page, un effet de bord découvert en testant).
function draftKey(eventId: string, channel: "main" | "backstage") {
  return `konfeti-chat-draft:${eventId}:${channel}`;
}

function readDraft(eventId: string, channel: "main" | "backstage") {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(draftKey(eventId, channel)) ?? "";
}

// Icône trait simple (pas un emoji réel) : cohérent avec le reste des
// boutons d'action de l'app, qui n'utilisent jamais d'emoji système.
function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function MessageComposer({
  eventId,
  rsvpId,
  channel,
  replyingTo,
  onCancelReply,
  onOptimisticSend,
  onSendSettled,
}: {
  eventId: string;
  rsvpId: string;
  channel: "main" | "backstage";
  replyingTo: ChatMessageView | null;
  onCancelReply: () => void;
  onOptimisticSend: (message: ChatMessageView) => void;
  onSendSettled: (tempId: string, result: { ok: true; id: string } | { ok: false }) => void;
}) {
  const t = useTranslations("Chat");
  // Initialiseur paresseux (pas un effet) : ChatRoom remonte ce composant
  // via `key={channel}` à chaque bascule Général/Coulisses, donc lire
  // sessionStorage ici resynchronise naturellement le brouillon sans jamais
  // déclencher de setState après coup. Léger risque d'avertissement
  // d'hydratation si un brouillon existait déjà au tout premier chargement
  // de la page (sessionStorage absent côté serveur) — cas limite sans
  // conséquence, le contenu affiché reste correct.
  const [body, setBody] = useState(() => readDraft(eventId, channel));
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateBody(value: string) {
    setBody(value);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(draftKey(eventId, channel), value);
    }
  }

  function handleSendText() {
    const trimmed = body.trim();
    if (!trimmed || isPending) return;
    updateBody("");
    setError(null);
    const replyTo = replyingTo?.id;
    onCancelReply();

    // Optimistic UI (retour de "Claude" transmis par Thomas, confirmé) : la
    // bulle apparaît immédiatement, avant même la réponse du serveur — voir
    // le commentaire détaillé dans ChatRoom.handleOptimisticSend.
    const tempId = `temp:${crypto.randomUUID()}`;
    onOptimisticSend({
      id: tempId,
      channel,
      body: trimmed,
      photoUrl: null,
      replyTo: replyTo ?? null,
      isSystem: false,
      deletedByAdmin: false,
      createdAt: new Date().toISOString(),
      rsvpId,
      authorName: null,
      authorAvatarUrl: null,
      systemAuthorName: null,
      status: "sending",
    });

    startTransition(async () => {
      const result = await sendMessage({ eventId, rsvpId, channel, body: trimmed, replyTo });
      if (result.ok) {
        onSendSettled(tempId, { ok: true, id: result.messageId });
      } else {
        // Bulle optimiste retirée (voir ChatRoom.handleSendSettled), texte
        // remis dans le champ pour pouvoir renvoyer sans tout retaper.
        setError(t("sendError"));
        updateBody(trimmed);
        onSendSettled(tempId, { ok: false });
      }
    });
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.set("photo", file);
    const uploadResult = await uploadMessagePhoto(formData);
    setUploading(false);

    if (!uploadResult.ok) {
      setError(uploadResult.error === "disabled" ? t("composer.photosDisabled") : t("sendError"));
      return;
    }

    const replyTo = replyingTo?.id;
    onCancelReply();

    // Pas de bulle optimiste pour la photo (contrairement au texte) : l'
    // upload lui-même (au-dessus) est déjà le vrai goulot de latence ici, pas
    // l'aller-retour Realtime — l'optimistic UI n'apporterait donc pas le
    // même gain perçu, pour un aperçu local à construire (`URL.createObjectURL`)
    // en plus. Laissé pour une itération future si le besoin se confirme.
    startTransition(async () => {
      const result = await sendMessage({
        eventId,
        rsvpId,
        channel,
        photoUrl: uploadResult.path,
        replyTo,
      });
      if (!result.ok) setError(t("sendError"));
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {replyingTo && (
        // Même code visuel que l'aperçu de citation dans MessageBubble
        // (bordure gauche + nom + texte cité) : avant, on ne voyait que
        // "Réponse à X" sans le contenu du message, impossible à distinguer
        // s'il y en avait plusieurs du même auteur (retour Thomas : "on ne
        // comprend pas bien qu'on répond au message").
        <div className="flex items-center gap-2 rounded-r-konfeti border-l-2 border-primary bg-surface py-1.5 pl-2 pr-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">
              {t("composer.replyingTo")} {replyingTo.authorName ?? t("anonymousAuthor")}
            </p>
            <p className="line-clamp-1 text-xs text-foreground/60">{replyingTo.body ?? "📷"}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={t("composer.cancelReply")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-foreground/50 hover:bg-primary/10"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-accent-coral">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || isPending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/60 hover:bg-primary/10 disabled:opacity-50"
          aria-label={t("composer.addPhoto")}
        >
          <CameraIcon className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <input
          // Id stable ciblé directement par MessageBubble au clic sur
          // "Répondre" (retour Thomas : "on arrive directement dans écrire
          // message et sur mobile ça ouvre le clavier") -- le focus doit
          // rester synchrone dans le MÊME gestionnaire de clic natif pour
          // que le clavier virtuel s'ouvre sur mobile (Safari iOS ignore un
          // `.focus()` déclenché depuis un effet React après coup, une fois
          // sorti de la pile d'appel du geste utilisateur d'origine).
          id="chat-message-input"
          type="text"
          value={body}
          onChange={(e) => updateBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSendText();
          }}
          placeholder={t("composer.placeholder")}
          className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-base text-foreground placeholder:text-foreground/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
        <button
          type="button"
          onClick={handleSendText}
          disabled={isPending || !body.trim()}
          aria-label={t("composer.send")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
