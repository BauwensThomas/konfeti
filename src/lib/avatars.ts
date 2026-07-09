import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pack d'avatars "maison" (brief 1.1) : personnages dans le style de la
 * mascotte, générés en une seule grille par Gemini puis découpés par
 * `scripts/generate-image-assets.mjs` (voir doc/mascotte-style.md pour le
 * prompt). Alternative à l'upload d'une photo personnelle (`avatar_kind:
 * "photo"` sur `profiles`/`rsvps`).
 */
export type PresetAvatar = {
  key: string;
  path: string;
};

export const PRESET_AVATARS: PresetAvatar[] = [
  { key: "avatar-1", path: "/avatars/avatar-1.webp" },
  { key: "avatar-2", path: "/avatars/avatar-2.webp" },
  { key: "avatar-3", path: "/avatars/avatar-3.webp" },
  { key: "avatar-4", path: "/avatars/avatar-4.webp" },
  { key: "avatar-5", path: "/avatars/avatar-5.webp" },
  { key: "avatar-6", path: "/avatars/avatar-6.webp" },
  { key: "avatar-7", path: "/avatars/avatar-7.webp" },
  { key: "avatar-8", path: "/avatars/avatar-8.webp" },
];

// Résout l'URL affichable d'un avatar (chemin statique du pack maison, ou
// URL signée pour une photo perso dans le bucket privé "event-photos").
// Partagé entre EventPersonnes (Personnes) et EventChat (Phase 5), pour ne
// pas dupliquer la génération d'URL signées.
export async function resolveAvatarUrl(
  supabase: SupabaseClient,
  avatarKind: "preset" | "photo",
  avatarValue: string | null,
): Promise<string | null> {
  if (!avatarValue) return null;
  if (avatarKind === "preset") {
    return PRESET_AVATARS.find((a) => a.key === avatarValue)?.path ?? null;
  }
  const { data } = await supabase.storage.from("event-photos").createSignedUrl(avatarValue, 3600);
  return data?.signedUrl ?? null;
}

// Même bucket privé "event-photos", pour une photo postée dans le chat
// (brief 4.3) : le chemin stocké en base (`messages.photo_url`) n'est jamais
// directement affichable, toujours une URL signée à générer à la lecture.
export async function resolveEventPhotoUrl(
  supabase: SupabaseClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("event-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
