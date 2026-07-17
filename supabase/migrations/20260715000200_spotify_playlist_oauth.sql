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

-- Bug réel trouvé en testant une reconstruction complète depuis zéro (retour
-- Thomas : "un fichier sql avec toutes les tables") : sur une base FRAÎCHE,
-- `playlist_suggestions` n'a jamais été ajoutée à la publication realtime
-- (l'ajout faisait partie de la version ORIGINALE de ce fichier, remplacée
-- ici par son annulation) -- `alter publication ... drop table` échouait donc
-- avec "relation is not part of the publication". Sur la vraie base de
-- Thomas, la table y avait bien été ajoutée pour de vrai avant d'être
-- retirée : cette instruction a réussi une seule fois, en conditions réelles,
-- jamais rejouée depuis. Rendue idempotente pour fonctionner dans les deux
-- cas (base fraîche ou déjà migrée).
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'playlist_suggestions'
  ) then
    alter publication supabase_realtime drop table playlist_suggestions;
  end if;
end $$;
