// "Julie" / "Julie et Marc" / "Julie, Marc et Sophie" -- pas de virgule
// d'Oxford avant "et", convention française standard. Utilisé à la fois par
// l'étape 5 du wizard (CreateEventWizard.tsx) et la bannière "X n'a pas
// accès au chat" (ChatRoom.tsx).
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}
