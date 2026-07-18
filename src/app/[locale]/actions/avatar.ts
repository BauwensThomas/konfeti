"use server";

import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/guest-session";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { uploadAndVerify } from "@/lib/upload-and-verify";

export type UploadAvatarResult =
  | { ok: true; path: string }
  | { ok: false; error: "invalid" | "too_large" | "rate_limited" | "unknown" };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 Mo, avant redimensionnement
const AVATAR_DIMENSION = 500; // px, côté le plus long

// Contrairement à uploadEventPhoto (réservée à l'hôte), l'avatar est un
// champ d'identité (brief 1.1) ouvert à tout participant approuvé.
export async function uploadAvatarPhoto(formData: FormData): Promise<UploadAvatarResult> {
  const supabase = await createClient();
  const user = await requireUser(supabase);

  if (!user) {
    return { ok: false, error: "unknown" };
  }

  // Limité par IP en plus de l'utilisateur : défense en profondeur contre un
  // abus via plusieurs comptes créés depuis la même machine.
  const ip = await getClientIp();
  if (isRateLimited(`uploadAvatarPhoto:${ip}`, 20, 60 * 60 * 1000)) {
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
      .resize({
        width: AVATAR_DIMENSION,
        height: AVATAR_DIMENSION,
        fit: "cover",
      })
      .webp({ quality: 80 })
      .toBuffer();

    // Validation du buffer avant l'envoi -- garde utile en soi, mais
    // insuffisante seule : retour Thomas, une photo dont CE buffer passait
    // déjà cette vérification s'est quand même retrouvée corrompue dans
    // Storage. Root-causé via Sentry : "An unexpected response was received
    // from the server" sur une connexion mobile instable -- la corruption
    // arrive donc APRÈS ce point, pendant l'envoi réseau vers Supabase
    // Storage lui-même, jamais dans le traitement `sharp`.
    await sharp(resized).metadata();

    const path = `${user.id}/avatars/${crypto.randomUUID()}.webp`;
    if (!(await uploadAndVerify(supabase, path, resized))) {
      return { ok: false, error: "unknown" };
    }

    return { ok: true, path };
  } catch {
    return { ok: false, error: "invalid" };
  }
}
