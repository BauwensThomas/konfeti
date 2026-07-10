import { randomConfettiPieces, confettiBorderRadius, confettiClipPath } from "@/lib/confetti";

// Généré une seule fois au chargement du module, comme `ConfettiBackground`
// (fond de page) -- mais ce panneau se démonte/remonte à chaque changement
// d'onglet (voir ChatRoom/EventTabs) : une disposition différente à chaque
// réouverture du Chat est un choix assumé, sans lien avec le "ça saute
// pendant la lecture" que Thomas voulait éviter pour la page (là, on ne lit
// rien pendant que l'onglet se démonte).
const PIECES = randomConfettiPieces(26);

/**
 * Confettis discrets en fond de la zone de chat -- retour Thomas : "il
 * faudrait un peu animer le fond gris, avec petites formes de confetti
 * aléatoires très légères de différentes couleurs qui resteront toujours
 * derrière le texte", puis "je vois que les confettis bougent, ce n'est
 * pas nécessaire, ils peuvent rester fixe" (l'animation de dérive a donc été
 * retirée -- pièces statiques, comme `ConfettiBackground`).
 *
 * Posé DANS le flux normal du contenu qui défile (voir ChatRoom : ce
 * composant est un enfant `absolute inset-0` d'un wrapper `relative` dont la
 * hauteur "auto" grandit avec les messages empilés), pas épinglé au cadre
 * visible : retour Thomas, "les confettis doivent être ancrés dans le chat,
 * quand je défile vers le bas ça doit être des autres" -- des pièces
 * différentes doivent apparaître plus bas dans une longue conversation.
 * `-z-10` + `pointer-events-none` : toujours derrière les bulles, jamais
 * cliquable.
 */
export function ChatConfettiBackground() {
  return (
    // Opacité à 25% (pas 10% comme le fond de PAGE, `ConfettiBackground`) :
    // un premier essai à 8% était invisible en pratique sur le gris neutre
    // du chat, bien moins contrasté que le crème/blanc de la page (retour
    // Thomas : "je ne vois pas les confettis sur le fond gris").
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-25"
    >
      {PIECES.map((piece) => (
        <span
          key={piece.id}
          style={{
            position: "absolute",
            top: `${piece.top}%`,
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            borderRadius: confettiBorderRadius(piece.shape),
            clipPath: confettiClipPath(piece.shape),
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
