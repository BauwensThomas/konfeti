import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

// Filet de sécurité contre une corruption en transit vers Supabase Storage
// (retour Thomas : une photo dont le buffer local était valide juste avant
// l'envoi s'est quand même retrouvée corrompue une fois dans Storage --
// root-causé via Sentry, "An unexpected response was received from the
// server" sur une connexion mobile instable). Upload puis re-télécharge
// immédiatement pour vérifier que ce qui est RÉELLEMENT arrivé dans Storage
// est décodable, pas seulement le buffer avant envoi. Une tentative de
// renvoi (souvent suffisant pour un aléa réseau ponctuel) avant d'abandonner
// et de nettoyer le fichier invalide. Partagé entre `uploadAvatarPhoto`,
// `uploadEventPhoto` et `uploadMessagePhoto` -- même pipeline sharp/Storage
// dans les trois.
export async function uploadAndVerify(
  supabase: SupabaseClient,
  path: string,
  bytes: Buffer,
  attempt = 1,
): Promise<boolean> {
  const { error } = await supabase.storage.from("event-photos").upload(path, bytes, { contentType: "image/webp" });
  if (error) return false;

  const { data: uploaded, error: downloadError } = await supabase.storage.from("event-photos").download(path);
  if (downloadError) return false;

  try {
    await sharp(Buffer.from(await uploaded.arrayBuffer())).metadata();
    return true;
  } catch {
    if (attempt >= 2) {
      await supabase.storage.from("event-photos").remove([path]);
      return false;
    }
    return uploadAndVerify(supabase, path, bytes, attempt + 1);
  }
}
