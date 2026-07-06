const COLORS = ["#7C3AED", "#FACC15", "#FB7185", "#34D399", "#C4B5FD"];
const SHAPES = ["circle", "square", "triangle", "diamond"] as const;

function randomPieces(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: 10 + Math.random() * 16,
    rotate: Math.random() * 360,
  }));
}

// Calculé une seule fois au chargement du module (pas à chaque rendu) : sinon
// la disposition "sautait" à chaque revalidation de page (ex. voter pour une
// date), ce que Thomas trouvait dérangeant. Reste stable tant que le serveur
// tourne, recalculé seulement au prochain build/redémarrage.
const PIECES = randomPieces(24);

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
            borderRadius: piece.shape === "circle" ? "9999px" : piece.shape === "square" ? "3px" : 0,
            clipPath:
              piece.shape === "triangle"
                ? "polygon(50% 0%, 0% 100%, 100% 100%)"
                : piece.shape === "diamond"
                  ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)"
                  : undefined,
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
