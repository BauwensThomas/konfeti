// Ajout des langues NL/EN/ES/PT-BR/DE (retour Thomas) : plusieurs endroits
// formataient les dates en dur en "fr-BE"/"fr-FR", peu importe la langue
// active de l'app -- une page en néerlandais ou en anglais affichait quand
// même des dates au format français. Une seule table de correspondance ici,
// réutilisée partout où une date est formatée manuellement (pas via
// next-intl, qui ne gère pas nativement `toLocaleDateString`).
const DATE_LOCALE_TAGS: Record<string, string> = {
  fr: "fr-BE",
  nl: "nl-BE",
  en: "en-GB",
  es: "es-ES",
  pt: "pt-PT",
  de: "de-DE",
};

export function dateLocaleTag(locale: string): string {
  return DATE_LOCALE_TAGS[locale] ?? "fr-BE";
}
