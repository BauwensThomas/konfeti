// Calcul des frais de la cagnotte (Phase 7, brief 4.5/5.6/8) : montants
// toujours en centimes (int), jamais de float pour de l'argent. Commission
// Konfeti fixée à 5% (confirmé avec Thomas -- le "plafond psychologique" déjà
// identifié dans le brief), frais Stripe indicatifs du brief pour une carte
// EU (1,5% + 0,25€), qui restent une estimation affichée au contributeur --
// les frais RÉELS prélevés par Stripe peuvent varier légèrement selon le
// type de carte/la banque, seul le webhook fait foi pour ce qui est
// réellement arrivé dans la cagnotte.
export const KONFETI_COMMISSION_RATE = 0.05;
export const STRIPE_PERCENT_FEE = 0.015;
export const STRIPE_FIXED_FEE_CENTS = 25;
// Retour Thomas, cas réel observé en test (comparaison carte belge/Bancontact
// vs carte étrangère, mêmes 10€) : à 10€ pile, 5% de commission (0,55€) ne
// couvrait pas encore le vrai frais Stripe d'une carte étrangère (0,61€
// observé), le plancher à 0,50€ ne s'activant pas puisque 0,55€ le dépasse
// déjà. Remonté à 0,65€ pour couvrir aussi ce cas précis -- s'active donc
// jusqu'à environ 13-14€ de contribution, pas seulement les tout petits
// montants comme avant.
export const KONFETI_MIN_FEE_CENTS = 65;

export type PotFeeBreakdown = {
  netCents: number;
  grossCents: number;
  stripeFeeCents: number;
  konfetiFeeCents: number;
};

// Retour Thomas explicite : le contributeur choisit le NET qu'il veut voir
// arriver dans la cagnotte (pas le montant qu'il paie) -- "je veux X€ NET
// dans la cagnotte". Les deux frais sont un pourcentage du montant BRUT
// (celui réellement facturé), donc résoudre "quel brut donne ce net ?"
// demande d'inverser l'équation plutôt que de simplement additionner les
// frais au net :
//   net = brut - (brut*STRIPE_PERCENT_FEE + STRIPE_FIXED_FEE) - brut*KONFETI_COMMISSION_RATE
//   net = brut*(1 - STRIPE_PERCENT_FEE - KONFETI_COMMISSION_RATE) - STRIPE_FIXED_FEE
//   brut = (net + STRIPE_FIXED_FEE) / (1 - STRIPE_PERCENT_FEE - KONFETI_COMMISSION_RATE)
// Formule fermée (les deux frais sont linéaires en `brut`) : jamais besoin
// d'un solveur itératif.
export function feeBreakdownFromNet(netCents: number): PotFeeBreakdown {
  const rate = 1 - STRIPE_PERCENT_FEE - KONFETI_COMMISSION_RATE;
  let grossCents = Math.round((netCents + STRIPE_FIXED_FEE_CENTS) / rate);
  let konfetiFeeCents = Math.round(grossCents * KONFETI_COMMISSION_RATE);

  // Plancher de commission (voir constante `KONFETI_MIN_FEE_CENTS`) : sur un
  // petit montant, 5% du brut ne suffit pas toujours à couvrir un vrai frais
  // Stripe international -- recalcule le brut avec une commission FIXÉE au
  // plancher plutôt que de laisser passer une commission insuffisante.
  if (konfetiFeeCents < KONFETI_MIN_FEE_CENTS) {
    konfetiFeeCents = KONFETI_MIN_FEE_CENTS;
    grossCents = Math.round((netCents + STRIPE_FIXED_FEE_CENTS + konfetiFeeCents) / (1 - STRIPE_PERCENT_FEE));
  }

  // Retour Thomas, bug réel signalé : "pour 20€ on arrive à 20.01... il faut
  // que ce soit juste." Le net affiché doit rester EXACTEMENT celui demandé
  // (jamais recalculé/arrondi indépendamment) -- c'est donc le total des
  // frais qui devient le VRAI reste (brut - net), pas l'inverse. Seul
  // `konfetiFeeCents` doit être exact pour de vrai (c'est le montant envoyé
  // à Stripe comme `application_fee_amount`, voir actions/pot.ts) ; le
  // "frais Stripe" affiché n'est jamais qu'une estimation de toute façon
  // (voir commentaire de fichier), donc absorbe ici l'éventuel centime
  // d'écart d'arrondi sans que ça se voie sur le net.
  const totalFeeCents = grossCents - netCents;
  const stripeFeeCents = totalFeeCents - konfetiFeeCents;
  return { netCents, grossCents, stripeFeeCents, konfetiFeeCents };
}
