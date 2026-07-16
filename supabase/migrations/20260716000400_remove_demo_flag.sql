-- Retour Thomas (Phase 9, back-office) : le flag "demo" n'a jamais eu de
-- fonctionnalité derrière et n'en aura pas -- retiré plutôt que laissé inerte
-- indéfiniment dans /admin.
delete from feature_flags where key = 'demo';
