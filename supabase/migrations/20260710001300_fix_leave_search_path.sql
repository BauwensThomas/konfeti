-- Correctif : la migration 20260710001200 a recree leave_or_remove_participant
-- en copiant l'ancien entete `set search_path = public` (sans `private`),
-- ecrasant par megarde le correctif pose par une migration anterieure
-- (20260709000000_admin_validation_and_roles.sql) qui ajoutait `private` a
-- ce search_path suite au deplacement de is_my_rsvp/is_event_admin dans le
-- schema private. Consequence : tout appel a leave_or_remove_participant
-- echouait silencieusement ("function is_my_rsvp does not exist"), donc
-- "Quitter l'evenement" ne modifiait plus jamais la ligne rsvps.
alter function leave_or_remove_participant(uuid, text) set search_path = public, private;
