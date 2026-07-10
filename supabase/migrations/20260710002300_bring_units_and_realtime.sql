-- "Qui amene quoi" (brief 4.4, Phase 6) : le schema `bring_items`/`bring_claims`
-- existe depuis la Phase 1 (quantite en nombre entier, aucune unite), mais
-- aucune UI n'avait jamais ete construite dessus. Retour Thomas en validant
-- le plan : "l'organisateur doit pouvoir mettre lui-meme le nom (alcool,
-- dessert, soft, bonbon etc..) et pouvoir choisir litres, gramme, kilo ou
-- quantite" -- necessite une colonne d'unite et des quantites decimales
-- (ex. "1.5 L", "2.5 kg"), pas seulement des entiers.

alter table bring_items
  add column unit text not null default 'piece'
  check (unit in ('piece', 'liter', 'gram', 'kilogram'));

-- `quantity_needed`/`quantity` passent d'entier a numerique : aucune donnee
-- existante a convertir (fonctionnalite jamais utilisee jusqu'ici, aucune
-- vraie ligne en base), mais le type doit accepter les deux cas (un compte
-- de pieces ET une quantite en litres/kilos) des la premiere utilisation.
alter table bring_items
  alter column quantity_needed type numeric using quantity_needed::numeric;

alter table bring_claims
  alter column quantity type numeric using quantity::numeric;

-- Ni bring_items ni bring_claims n'etaient dans la publication Realtime
-- (regle transverse du projet : tout changement doit se refleter en direct
-- chez tout le monde, voir DECISIONS.md) -- necessaire pour que les jauges
-- "quantite recue / demandee" se mettent a jour sans F5 (Accueil ET
-- Participer).
alter publication supabase_realtime add table bring_items, bring_claims;
