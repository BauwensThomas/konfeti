-- Mode Jour J, retour Thomas : "quand une personne dit je suis arrivé... il
-- doit passer de peut-être (s'il est sur peut-être) à je viens... s'il
-- reclique sur arrivé il reprend son ancien statut". Le check-in bascule
-- `answer` de 'maybe' à 'yes' (arriver, c'est forcément venir) ; annuler le
-- check-in doit restaurer la réponse d'origine, pas juste effacer
-- `checked_in_at` -- il faut donc se souvenir de cette réponse le temps du
-- check-in. Colonne interne (jamais exposée dans `rsvps_public_data`,
-- personne d'autre n'a besoin de la voir).
alter table rsvps add column answer_before_checkin text;

-- Auto-service, même principe que `checked_in_at`/`arrived_home_at`
-- (rsvps_update_own couvre déjà "sa propre ligne").
grant update (answer_before_checkin) on rsvps to authenticated;
