"use server";

import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/guest-session";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export type UploadPhotoResult =
  | { ok: true; path: string }
  | { ok: false; error: "not_authenticated" | "invalid" | "too_large" | "rate_limited" | "disabled" | "unknown" };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 Mo, avant redimensionnement
const MAX_DIMENSION = 1200; // px, côté le plus long

export async function uploadEventPhoto(formData: FormData): Promise<UploadPhotoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Utilisée par le wizard (création ET modification) et par
  // `EventPhotoEditor` : simple filet de sécurité côté serveur, l'UI ne
  // devrait de toute façon jamais atteindre cette action sans session.
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  // Limite par utilisateur (pas par IP) : le traitement sharp est coûteux en
  // ressources, à protéger d'un abus même depuis un compte légitime.
  if (isRateLimited(`uploadEventPhoto:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return { ok: false, error: "invalid" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "too_large" };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const resized = await sharp(bytes)
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // Filet de sécurité, voir même correctif dans actions/avatar.ts : revérifie
    // que le résultat est une image réellement décodable avant de l'uploader.
    await sharp(resized).metadata();

    const path = `${user.id}/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from("event-photos")
      .upload(path, resized, { contentType: "image/webp" });

    if (error) {
      return { ok: false, error: "unknown" };
    }

    return { ok: true, path };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

// Photo postée dans le chat (brief 4.3), même pipeline sharp/bucket privé
// "event-photos" que uploadAvatarPhoto. Limité par IP en plus de
// l'utilisateur : défense en profondeur contre un abus via plusieurs
// comptes créés depuis la même machine.
export async function uploadMessagePhoto(formData: FormData): Promise<UploadPhotoResult> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  if (!user) {
    return { ok: false, error: "unknown" };
  }

  // Coupe-circuit global (back-office /admin, retour Thomas) : désactivé, plus
  // personne ne peut poster de photo dans le chat, sur AUCUN événement --
  // vérifié ici (pas seulement côté UI) pour ne jamais dépendre de la seule
  // désactivation du bouton chez le client.
  const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "chat_photos").maybeSingle();
  if (flag?.enabled === false) {
    return { ok: false, error: "disabled" };
  }

  const ip = await getClientIp();
  if (isRateLimited(`uploadMessagePhoto:${ip}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return { ok: false, error: "invalid" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "too_large" };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const resized = await sharp(bytes)
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // Filet de sécurité, voir même correctif dans actions/avatar.ts : revérifie
    // que le résultat est une image réellement décodable avant de l'uploader.
    await sharp(resized).metadata();

    const path = `${user.id}/messages/${crypto.randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from("event-photos")
      .upload(path, resized, { contentType: "image/webp" });

    if (error) {
      return { ok: false, error: "unknown" };
    }

    return { ok: true, path };
  } catch {
    return { ok: false, error: "invalid" };
  }
}
