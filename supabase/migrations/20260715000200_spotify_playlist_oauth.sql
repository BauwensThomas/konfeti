-- Playlist Spotify (Phase 8) : ANNULÉE -- décision de Thomas de retirer la
-- fonctionnalité (Spotify bloque toute app en mode développement dont le
-- compte propriétaire n'a pas Spotify Premium, et la demande d'extension de
-- quota n'est pas accessible à Konfeti avant 250 000 utilisateurs actifs/mois
-- -- voir DECISIONS.md). Ce fichier annule la migration originale (déjà
-- appliquée par Thomas) plutôt que d'être supprimé, pour garder une trace
-- cohérente de ce qui a réellement tourné sur la base.
alter table profiles
  drop column if exists spotify_user_id,
  drop column if exists spotify_access_token,
  drop column if exists spotify_refresh_token,
  drop column if exists spotify_token_expires_at;

alter publication supabase_realtime drop table playlist_suggestions;
