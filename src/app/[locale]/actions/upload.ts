"use server";

import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { ensureGuestSession } from "@/lib/supabase/guest-session";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export type UploadPhotoResult =
  | { ok: true; path: string }
  | { ok: false; error: "not_authenticated" | "invalid" | "too_large" | "rate_limited" | "unknown" };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 Mo, avant redimensionnement
const MAX_DIMENSION = 1200; // px, côté le plus long

export async function uploadEventPhoto(formData: FormData): Promise<UploadPhotoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Utilisée par le wizard (création ET modification) et par
  // `EventPhotoEditor`. `/creer` bloque déjà les sessions anonymes en amont
  // (proxy.ts), donc ce contrôle ne servait qu'à bloquer à tort un admin
  // promu en session anonyme qui modifie la photo d'un événement existant
  // (même bug que updateEvent, voir events.ts).
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

// Photo postée dans le chat (brief 4.3) : ouvert aux sessions anonymes,
// comme uploadAvatarPhoto (aucun contrôle user.is_anonymous), même pipeline
// sharp/bucket privé "event-photos". Limité par IP (pas par utilisateur) :
// une session anonyme se recrée gratuitement, une limite par user.id seule
// serait triviale à contourner.
export async function uploadMessagePhoto(formData: FormData): Promise<UploadPhotoResult> {
  const supabase = await createClient();
  const user = await ensureGuestSession(supabase);

  if (!user) {
    return { ok: false, error: "unknown" };
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
