/**
 * Avatar générique rond affiché tant qu'aucune photo de couverture n'a été
 * choisie pour l'événement (demande de Thomas) : l'émoji "licorne" du pack
 * maison (`images/licorne.png`, optimisé par `scripts/generate-image-assets.mjs`
 * vers `public/photo-placeholder.webp`), jamais l'original modifié à la main.
 * Le padding interne recule volontairement le personnage par rapport au bord
 * du cercle (retour de Thomas : l'image touchait les bords).
 *
 * `<img>` plutôt que next/image : l'optimiseur next/image réintroduisait un
 * fond noir sur ces mêmes emojis maison (voir `attention.webp` dans
 * DECISIONS.md) ; ce sont déjà des fichiers locaux optimisés, aucun besoin de
 * les faire repasser par l'optimiseur.
 */
export function AvatarPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-surface p-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- voir commentaire ci-dessus */}
      <img src="/photo-placeholder.webp" alt="" className="h-full w-full object-contain" />
    </div>
  );
}
