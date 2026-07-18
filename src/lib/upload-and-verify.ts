import sharp from "sharp";
import * as Sentry from "@sentry/nextjs";
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

  const downloadedBytes = Buffer.from(await uploaded.arrayBuffer());
  try {
    await sharp(downloadedBytes).metadata();
    return true;
  } catch (sharpError) {
    // Diagnostic explicite (retour Thomas : corruption reproductible à
    // chaque tentative, y compris en WiFi -- l'hypothèse "aléa réseau
    // ponctuel" ne suffit plus à l'expliquer). Sans ce signalement manuel,
    // Sentry ne voit jamais cet échec : `uploadAndVerify` renvoie un
    // résultat géré, jamais une exception qui remonterait jusqu'au global
    // error handler. Contexte complet capturé pour comparer un prochain cas
    // (taille avant/après, tentative, message d'erreur sharp exact).
    Sentry.captureMessage("uploadAndVerify: fichier corrompu après upload vers Storage", {
      level: "warning",
      extra: {
        path,
        attempt,
        localBytesLength: bytes.length,
        downloadedBytesLength: downloadedBytes.length,
        // Distingue une corruption déjà présente AVANT l'envoi (buffers
        // identiques -- pointerait vers sharp/l'encodage lui-même) d'une
        // vraie corruption en transit (buffers différents malgré une même
        // taille, ou taille différente -- pointerait vers le réseau/Storage).
        bytesIdenticalToLocal: bytes.equals(downloadedBytes),
        sharpError: sharpError instanceof Error ? sharpError.message : String(sharpError),
      },
    });
    if (attempt >= 2) {
      await supabase.storage.from("event-photos").remove([path]);
      return false;
    }
    return uploadAndVerify(supabase, path, bytes, attempt + 1);
  }
}
