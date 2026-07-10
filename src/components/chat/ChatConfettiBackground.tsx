import { buildConfettiTileDataUri } from "@/lib/confetti";

// Taille du motif répété (px) et nombre de pièces par motif -- densité
// choisie pour rester proche de l'ancien rendu (26 pièces sur un panneau
// d'environ 600-700px de large/haut).
const TILE_SIZE = 320;
const TILE_DATA_URI = buildConfettiTileDataUri(TILE_SIZE, 7);

/**
 * Confettis discrets en fond de la zone de chat -- retour Thomas : "il
 * faudrait un peu animer le fond gris, avec petites formes de confetti
 * aléatoires très légères de différentes couleurs qui resteront toujours
 * derrière le texte", puis "je vois que les confettis bougent, ce n'est
 * pas nécessaire, ils peuvent rester fixe" (pièces statiques, comme
 * `ConfettiBackground`).
 *
 * Bug réel corrigé (retour Thomas : "au plus on écrit, au plus ils
 * s'écartent les uns des autres") : contrairement à `ConfettiBackground`
 * (page, hauteur fixe), la hauteur de ce fond grandit avec les messages --
 * un ensemble fixe de pièces positionnées en pourcentage s'écartait donc
 * mécaniquement au lieu d'en révéler de nouvelles. Remplacé par un MOTIF
 * RÉPÉTÉ (image CSS `background-repeat`, voir `buildConfettiTileDataUri`) :
 * densité constante quelle que soit la hauteur réelle, "tout le chat" rempli
 * même vide (une image de fond couvre toujours 100% de son conteneur), et de
 * nouvelles répétitions apparaissent naturellement à mesure que la
 * conversation grandit -- sans JS, sans mesure de hauteur.
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
      style={{
        backgroundImage: `url("${TILE_DATA_URI}")`,
        backgroundRepeat: "repeat",
        backgroundSize: `${TILE_SIZE}px ${TILE_SIZE}px`,
      }}
    />
  );
}
