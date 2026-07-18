"use client";

import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/Modal";

// Retour Thomas : `capture="environment"` seul ouvre directement l'appareil
// photo sur son téléphone (Xiaomi/MIUI), sans plus jamais proposer la
// galerie -- alors que l'input SANS capture, lui, n'ouvrait que la galerie
// (jamais de sélecteur natif combiné caméra+galerie sur cet appareil). Seule
// solution fiable cross-appareils : deux `<input type="file">` distincts
// (un avec `capture`, un sans), déclenchés explicitement via ce petit popup
// de choix -- même pattern `Modal fitContent` que le reste du projet
// (émojis, unités...) plutôt qu'un `<select>` natif.
export function PhotoSourceModal({
  open,
  onClose,
  onCamera,
  onGallery,
}: {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
}) {
  const t = useTranslations("PhotoSourcePicker");

  return (
    <Modal open={open} onClose={onClose} fitContent>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={onCamera}
          className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
        >
          {t("camera")}
        </button>
        <button
          type="button"
          onClick={onGallery}
          className="rounded-konfeti px-4 py-3 text-left text-base text-foreground hover:bg-primary/10"
        >
          {t("gallery")}
        </button>
      </div>
    </Modal>
  );
}
