-- Le chat (Phase 5, brief 4.3). Le schema (messages, message_reactions,
-- chat_reads) et les RLS de base existent depuis la Phase 1. Cette migration
-- active Realtime, corrige 3 bugs latents decouverts en preparant cette
-- phase, et ajoute ce qui manque (sticker-message, message systeme).

-- a) Realtime : necessaire pour que le chat vive en direct (brief 4.3).
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table message_reactions;

-- b) Anonymisation (brief 1.5/4.3) : rsvps_public_data_select ne filtrait
-- que status = 'approved', rendant une ligne anonymisee (removed/left,
-- deja first_name = null) invisible pour un non-admin. Sans ca, le nom
-- "Anonyme" d'un participant parti ne peut plus se resoudre du tout dans le
-- chat. Elargir ne fuite rien de nouveau (colonnes sensibles deja nulles) ;
-- pending/restricted restent exclus (file d'attente toujours admin-only).
drop policy "rsvps_public_data_select" on rsvps_public_data;
create policy "rsvps_public_data_select" on rsvps_public_data
  for select to authenticated
  using (
    status in ('approved', 'removed', 'left')
    and (private.is_event_admin(event_id) or private.is_event_approved_participant(event_id))
  );

-- c) Masquage Coulisses sur les reactions (bug latent) : contrairement a
-- messages_select, ces policies ne revérifiaient jamais
-- channel = 'main' or not is_event_beneficiary, laissant un beneficiaire
-- potentiellement voir/poser des reactions sur un message backstage.
drop policy "message_reactions_select" on message_reactions;
create policy "message_reactions_select" on message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and (
          private.is_event_admin(m.event_id)
          or (
            private.is_event_approved_participant(m.event_id)
            and (m.channel = 'main' or not private.is_event_beneficiary(m.event_id))
          )
        )
    )
  );

drop policy "message_reactions_write_own" on message_reactions;
create policy "message_reactions_write_own" on message_reactions
  for insert to authenticated
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from messages m
      where m.id = message_id
        and private.is_event_approved_participant(m.event_id)
        and (m.channel = 'main' or not private.is_event_beneficiary(m.event_id))
    )
  );
-- message_reactions_delete_own inchangee : supprimer sa propre reaction ne
-- peut rien fuiter de plus que ce qu'on a deja pu lire/ecrire.

-- d) Fix integrite reply_to (bug latent) : supprimer un message cite en
-- reponse violait la contrainte FK par defaut (NO ACTION), cassant
-- silencieusement "suppression de ses propres messages".
alter table messages drop constraint messages_reply_to_fkey;
alter table messages add constraint messages_reply_to_fkey
  foreign key (reply_to) references messages(id) on delete set null;

-- e) Sticker envoye en tant que message (distinct de la reaction, qui a deja
-- son propre sticker_id sur message_reactions). Meme registre des 5
-- stickers maison existants (src/components/stickers/index.tsx).
alter table messages add column sticker_id text
  check (sticker_id is null or sticker_id in ('confetti', 'gift', 'cake', 'cocktail', 'disco-ball'));
grant insert (sticker_id) on messages to authenticated;

-- f) Message systeme "X a rejoint la fete" (brief 4.3), insere au moment de
-- l'approbation - seul point de passage vers status = 'approved'. `body`
-- contient une cle machine ("joined"), jamais du texte fige (convention
-- i18n du projet) : resolu cote client via
-- t("Chat.systemMessages.joined", { name }). rsvp_id est renseigne
-- (contrairement a la convention "system = rsvp_id null") pour pouvoir
-- resoudre le prenom au moment de l'affichage via rsvps_public_data.
create or replace function admin_approve_rsvp(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  if p_role not in ('guest', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'pending' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set
    status = 'approved',
    role = p_role,
    approved_by = (select auth.uid()),
    approved_at = now(),
    updated_at = now()
  where id = p_rsvp_id;

  insert into messages (event_id, rsvp_id, channel, is_system, body)
  values (v_event_id, p_rsvp_id, 'main', true, 'joined');
end;
$$;

-- g) Policy Storage pour les photos de message (bucket prive event-photos) :
-- le pattern existant (event_photos_participant_select) ne couvre que la
-- cover photo et les avatars, pas les photos postees dans le chat.
create policy "event_photos_message_photo_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos' and exists (
      select 1 from messages
      where messages.photo_url = storage.objects.name
        and (
          private.is_event_admin(messages.event_id)
          or (
            private.is_event_approved_participant(messages.event_id)
            and (messages.channel = 'main' or not private.is_event_beneficiary(messages.event_id))
          )
        )
    )
  );
