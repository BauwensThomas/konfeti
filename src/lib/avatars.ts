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
