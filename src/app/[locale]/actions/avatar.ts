"use server";

import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { ensureGuestSession } from "@/lib/supabase/guest-session";

export type UploadAvatarResult =
  | { ok: true; path: string }
  | { ok: false; error: "invalid" | "too_large" | "unknown" };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 Mo, avant redimensionnement
const AVATAR_DIMENSION = 500; // px, côté le plus long

// Contrairement à uploadEventPhoto (réservée à l'hôte), l'avatar est un
// champ d'identité (brief 1.1) ouvert à tout participant, y compris un
// invité "code d'accès" en session anonyme (porte 2) : pas de contrôle
// `user.is_anonymous` ici.
export async function uploadAvatarPhoto(formData: FormData): Promise<UploadAvatarResult> {
  const supabase = await createClient();
  const user = await ensureGuestSession(supabase);

  if (!user) {
    return { ok: false, error: "unknown" };
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
      .resize({
        width: AVATAR_DIMENSION,
        height: AVATAR_DIMENSION,
        fit: "cover",
      })
      .webp({ quality: 80 })
      .toBuffer();

    const path = `${user.id}/avatars/${crypto.randomUUID()}.webp`;
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
