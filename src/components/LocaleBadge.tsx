// Pastille de langue dans le header (retour Thomas : "une boule un peu plus
// petite avec le drapeau français, quand on aura plusieurs langues on
// ouvrira une liste avec les autres langues"). Konfeti est français
// uniquement pour l'instant (`src/i18n/routing.ts`, `locales: ["fr"]`) --
// simple badge décoratif tant qu'il n'y a rien d'autre à choisir ; deviendra
// un déclencheur de liste déroulante le jour où une deuxième locale existe.
export function LocaleBadge() {
  return (
    <span
      role="img"
      aria-label="Langue actuelle : Français"
      title="Français"
      className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-primary/20"
    >
      <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
        <rect x="0" y="0" width="8" height="24" fill="#0055A4" />
        <rect x="8" y="0" width="8" height="24" fill="#FFFFFF" />
        <rect x="16" y="0" width="8" height="24" fill="#EF4135" />
      </svg>
    </span>
  );
}
