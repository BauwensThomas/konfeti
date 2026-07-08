-- Correctif anticipe des la Phase 3 (voir commentaire de
-- 20260706183317_add_birthday_photo.sql:5-10) : jusqu'ici seul l'hote
-- consultait jamais son propre evenement complet, donc restreindre la
-- lecture du bucket "event-photos" a "son propre dossier" suffisait. La
-- Phase 4 (validation des participants) rend ce trou reel : un participant
-- approuve doit voir la photo de couverture (dossier de l'hote) et les
-- avatars-photo des autres participants (onglet Personnes) sans jamais
-- pouvoir lire un fichier hors de tout evenement auquel il participe.
--
-- Policy additionnelle (les policies SELECT permissives se combinent par OR
-- avec "event_photos_own_folder_select" existante) : autorise la lecture
-- d'un fichier si son chemin est reference par la photo de couverture d'un
-- evenement, ou l'avatar-photo d'un participant, auquel l'appelant est admin
-- ou participant approuve.
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
        select 1 from rsvps
        where rsvps.avatar_value = storage.objects.name
          and rsvps.avatar_kind = 'photo'
          and (private.is_event_admin(rsvps.event_id) or private.is_event_approved_participant(rsvps.event_id))
      )
    )
  );
