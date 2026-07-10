import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover active:bg-primary-active shadow-konfeti",
  secondary: "bg-secondary text-foreground hover:brightness-95",
  ghost: "bg-transparent text-primary hover:bg-primary/10",
  danger: "bg-accent-coral text-white hover:brightness-95 shadow-konfeti",
};

// Classes de taille jamais concatenees avec un override partiel ailleurs
// (px/py/text du variant "sm" doivent totalement remplacer ceux de "md",
// pas s'y ajouter) : meme piege deja rencontre avec Modal/fitContent, l'ordre
// du CSS genere par Tailwind ne garantit pas qu'une classe concatenee en fin
// de chaine gagne sur une classe conflictuelle plus tot dans la chaine.
const SIZE_CLASSES: Record<Size, string> = {
  md: "px-6 py-3 text-base",
  sm: "px-4 py-2 text-sm",
};

// Exportée pour styler un élément qui n'est pas un vrai `<button>` (ex. un
// `Link` de navigation) exactement comme ce composant, sans dupliquer les
// classes (ex. "Modifier" sur la page événement, brief 5.7).
export function buttonClassName({
  variant = "primary",
  size = "md",
  className = "",
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `inline-flex items-center justify-center gap-2 rounded-full font-display font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClassName({ variant, size, className })} {...props} />;
}
