import { describe, expect, it } from "vitest";
import { KONFETI_MIN_FEE_CENTS, feeBreakdownFromNet } from "./pot-fees";

describe("feeBreakdownFromNet", () => {
  it("calcule le montant brut à partir du net demandé (exemples vérifiés avec Thomas)", () => {
    // 500 et 1000 déclenchent désormais le plancher de commission (voir plus
    // bas, remonté à 0,65€ après le test réel carte étrangère à 10€ pile).
    expect(feeBreakdownFromNet(500).grossCents).toBe(599);
    expect(feeBreakdownFromNet(1000).grossCents).toBe(1107);
    expect(feeBreakdownFromNet(10000).grossCents).toBe(10722);
    expect(feeBreakdownFromNet(100000).grossCents).toBe(106979);
  });

  it("applique un plancher de commission sur les petits montants (retour Thomas : test réel comparant carte belge/Bancontact -- rentables -- et carte étrangère -- déficitaire -- sur une même contribution de 10€)", () => {
    // 5€ et 10€ net : 5% du brut seul ne suffirait pas à couvrir un vrai
    // frais Stripe de carte étrangère (0,61€ observé en test sur un 10€) --
    // le plancher (0,65€) prend le relais pour les deux.
    expect(feeBreakdownFromNet(500).konfetiFeeCents).toBe(KONFETI_MIN_FEE_CENTS);
    expect(feeBreakdownFromNet(1000).konfetiFeeCents).toBe(KONFETI_MIN_FEE_CENTS);
    // 20€ net : déjà au-dessus du plancher tout seul, ne change donc rien.
    expect(feeBreakdownFromNet(2000).konfetiFeeCents).toBeGreaterThan(KONFETI_MIN_FEE_CENTS);
  });

  it("les 3 montants affichés (frais Stripe + commission + net) s'additionnent toujours exactement au brut", () => {
    for (const net of [500, 999, 1000, 2000, 5000, 7000, 10000, 12000, 15000, 20000, 30000, 50000, 75000, 100000]) {
      const breakdown = feeBreakdownFromNet(net);
      expect(breakdown.stripeFeeCents + breakdown.konfetiFeeCents + breakdown.netCents).toBe(breakdown.grossCents);
    }
  });

  it("le net retourné est toujours EXACTEMENT le net demandé, jamais un centime d'écart (bug réel signalé par Thomas : 20€ affichait 20.01€)", () => {
    for (const net of [500, 999, 1000, 2000, 3000, 3500, 5000, 10000, 12000, 15000, 20000, 30000, 50000, 100000]) {
      expect(feeBreakdownFromNet(net).netCents).toBe(net);
    }
  });
});
