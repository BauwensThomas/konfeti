import { randomConfettiPieces, confettiBorderRadius, confettiClipPath } from "@/lib/confetti";

// Calculé une seule fois au chargement du module (pas à chaque rendu) : sinon
// la disposition "sautait" à chaque revalidation de page (ex. voter pour une
// date), ce que Thomas trouvait dérangeant. Reste stable tant que le serveur
// tourne, recalculé seulement au prochain build/redémarrage.
const PIECES = randomConfettiPieces(24);

/**
 * Confettis discrets dispersés aléatoirement sur toute la page (demande de
 * Thomas : des formes variées, pas juste le sticker confetti répété). La
 * disposition est random une fois pour toutes, pas recalculée à chaque
 * affichage (voir commentaire sur PIECES ci-dessus).
 */
export function ConfettiBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-10"
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
