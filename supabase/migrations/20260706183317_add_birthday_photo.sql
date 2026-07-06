-- Photo optionnelle de la personne fêtée (occasion "anniversaire"), demandée par Thomas.
-- Stockage : bucket prive "event-photos", un dossier par utilisateur (`{user_id}/...`),
-- verifie via storage.foldername(name) = auth.uid(). Pas de notion d'event_id ici : au
-- moment de l'upload (dans le wizard), l'evenement n'existe pas encore, donc on ne peut
-- pas verifier l'appartenance a un evenement. Comme seul l'hote peut aujourd'hui consulter
-- son propre evenement (pas encore de participants, Phase 4), restreindre a "sa propre
-- fichier" suffit pour l'instant. A revisiter quand des invites pourront aussi voir la
-- photo (Phase 4) : la policy de lecture devra alors s'appuyer sur les memes fonctions
-- private.is_event_admin/is_event_approved_participant que la table events, en passant
-- par l'event_id encode dans le chemin plutot que l'auth.uid() seul.

alter table events add column birthday_photo_path text;

insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', false)
on conflict (id) do nothing;

create policy "event_photos_own_folder_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event_photos_own_folder_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event_photos_own_folder_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event_photos_own_folder_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
