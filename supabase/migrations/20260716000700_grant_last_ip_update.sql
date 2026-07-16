-- Bug réel trouvé par l'audit sécurité : `last_ip` (ajoutée par
-- 20260716000500_track_blocked_metadata.sql) n'avait jamais reçu le grant
-- update dédié -- contrairement à toutes les autres colonnes self-service de
-- `rsvps` (wants_pot_access, arrived_home_at, wants_reminders...), qui suivent
-- toutes ce même pattern juste après leur `alter table add column`.
-- `src/app/[locale]/actions/rsvp.ts` (`.update({ last_ip: ip })`) échouait
-- donc silencieusement (permission refusée par PostgREST au niveau colonne) :
-- la page `/admin/blocked` n'affichait jamais de vraie IP.
grant update (last_ip) on rsvps to authenticated;
