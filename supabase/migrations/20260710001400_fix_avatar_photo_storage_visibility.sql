-- Bug reel signale par Thomas en testant avec 3 comptes : l'avatar-photo
-- d'un participant s'affiche correctement pour un admin, mais reste le
-- mascotte par defaut pour un participant non-admin regardant la MEME photo.
--
-- Cause : "event_photos_participant_select" (20260709000100) verifie
-- l'avatar via `exists (select 1 from rsvps where rsvps.avatar_value = ...)`.
-- Cette sous-requete porte sur la table BRUTE `rsvps`, donc sa propre RLS
-- ("rsvps_select_own_or_admin" : profile_id = auth.uid() OU admin) s'applique
-- AVANT meme la condition explicite de cette policy Storage -- un participant
-- non-admin ne peut donc jamais y voir la ligne d'un AUTRE participant,
-- meme si "is_event_approved_participant" est vrai. `createSignedUrl` echoue
-- alors silencieusement (data.signedUrl est absent), et le code cote client
-- retombe sur `null` -- donc l'avatar par defaut (voir resolveAvatarUrl).
--
-- Correctif : pointer cette sous-requete sur `rsvps_public_data` (table
-- miroir deja synchronisee, avatar_kind/avatar_value inclus, policy SELECT
-- deja plus permissive : tout participant approuve OU admin voit toutes les
-- lignes approved/removed/left de l'evenement) plutot que sur `rsvps`.
drop policy "event_photos_participant_select" on storage.objects;

create policy "event_photos_participant_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos' and (
      exists (
        select 1 from events
        where events.cover_photo_path = storage.objects.name
          and (private.is_event_admin(events.id) or private.is_event_approved_participant(events.id))
      )
      or exists (
        select 1 from rsvps_public_data
        where rsvps_public_data.avatar_value = storage.objects.name
          and rsvps_public_data.avatar_kind = 'photo'
          and (
            private.is_event_admin(rsvps_public_data.event_id)
            or private.is_event_approved_participant(rsvps_public_data.event_id)
          )
      )
    )
  );
