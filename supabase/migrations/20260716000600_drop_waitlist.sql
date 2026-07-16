-- Retrait complet de la waitlist (retour Thomas) : la landing ne propose
-- plus ce formulaire depuis la refonte de la Phase 6 (remplacée par une
-- vraie vitrine avec captures d'écran) -- le code applicatif était déjà
-- entièrement retiré, seule la table restait. `drop table` supprime aussi
-- ses policies RLS et index au passage.
drop table if exists waitlist cascade;
