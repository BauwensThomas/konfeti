"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateEventCoverPhoto } from "@/app/[locale]/actions/events";
import { uploadEventPhoto } from "@/app/[locale]/actions/upload";
import { AvatarPlaceholder } from "@/components/AvatarPlaceholder";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Photo de couverture affichée dans la bannière de la page événement. Pour
 * l'hôte, cliquer dessus ouvre directement un popup Changer/Supprimer, sans
 * repasser par tout le formulaire de modification (demande de Thomas).
 */
export function EventPhotoEditor({
  eventId,
  isHost,
  initialPhotoUrl,
}: {
  eventId: string;
  isHost: boolean;
  initialPhotoUrl: string | null;
}) {
  const t = useTranslations("EventPage");
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const avatarClasses =
    "h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-white/40 object-cover sm:h-28 sm:w-28";

  const photo = photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL signée/blob, pas une image optimisable par next/image
    <img src={photoUrl} alt="" className={avatarClasses} />
  ) : (
    <AvatarPlaceholder className={avatarClasses} />
  );

  if (!isHost) {
    return <div className="shrink-0">{photo}</div>;
  }

  function handleChangeClick() {
    setMenuOpen(false);
    inputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("photo", file);
    const result = await uploadEventPhoto(formData);
    setUploading(false);

    if (!result.ok) {
      setError(t("photoUploadError"));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    startTransition(async () => {
      const updateResult = await updateEventCoverPhoto(eventId, result.path);
      if (updateResult.ok) {
        setPhotoUrl(previewUrl);
      } else {
        setError(t("photoUploadError"));
      }
    });
  }

  function handleDeleteConfirmed() {
    startTransition(async () => {
      const result = await updateEventCoverPhoto(eventId, null);
      if (result.ok) {
        setPhotoUrl(null);
      }
      setConfirmingDelete(false);
      setMenuOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (photoUrl ? setMenuOpen(true) : inputRef.current?.click())}
        className="relative shrink-0 overflow-hidden rounded-full transition-[transform] active:scale-95"
      >
        {photo}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 text-xs font-semibold text-white opacity-0 transition-opacity hover:opacity-100">
          {t("photoChange")}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {uploading && <p className="text-xs text-white/80">{t("photoUploading")}</p>}
      {error && <p className="text-xs text-white">{error}</p>}

      <Modal open={menuOpen && !confirmingDelete} onClose={() => setMenuOpen(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, on évite le ré-encodage par l'optimiseur next/image (qui réintroduisait un fond noir) */}
        <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
        <Button onClick={handleChangeClick}>{t("photoChange")}</Button>
        <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
          {t("photoDelete")}
        </Button>
      </Modal>

      <Modal open={confirmingDelete} onClose={() => setConfirmingDelete(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local déjà optimisé, on évite le ré-encodage par l'optimiseur next/image (qui réintroduisait un fond noir) */}
        <img src="/attention.webp" alt="" width={200} height={200} className="mx-auto" />
        <p className="text-center text-base text-foreground">{t("photoDeleteConfirm")}</p>
        <div className="flex justify-center gap-3">
          <Button onClick={handleDeleteConfirmed} disabled={isPending}>
            {t("photoDeleteConfirmYes")}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
            {t("photoDeleteConfirmNo")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
