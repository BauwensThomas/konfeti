import sharp from "sharp";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

// Filet de sécurité contre une corruption vers Supabase Storage. Partagé
// entre `uploadAvatarPhoto`, `uploadEventPhoto` et `uploadMessagePhoto` --
// même pipeline sharp/Storage dans les trois.
//
// Cause racine trouvée grâce au diagnostic Sentry ci-dessous (comparaison
// octet-pour-octet) : le fichier corrompu contenait des séquences répétées
// `EF BF BD` (le caractère de remplacement Unicode U+FFFD en UTF-8) --
// signature classique d'octets binaires traités quelque part comme du texte
// UTF-8 puis reconvertis, chaque octet non valide en UTF-8 (très fréquent
// dans une image compressée) étant remplacé par ce caractère de 3 octets
// (d'où un fichier téléchargé PLUS GROS que l'original envoyé). Bug connu du
// SDK `@supabase/supabase-js` : passer un `Buffer` Node.js brut à `.upload()`
// peut se faire mal interpréter en interne selon le runtime -- corrigé en
// enveloppant explicitement dans un vrai `Blob` binaire avant l'envoi.
export async function uploadAndVerify(
  supabase: SupabaseClient,
  path: string,
  bytes: Buffer,
  attempt = 1,
): Promise<boolean> {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "image/webp" });
  const { error } = await supabase.storage.from("event-photos").upload(path, blob, { contentType: "image/webp" });
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
