-- Trois correctifs decouverts en testant en direct (retours Thomas) :

-- 1. La liste "Personnes" (EventPersonnes/ParticipantsList) n'ecoutait aucun
-- canal Realtime : un nouveau participant (ou la ligne de l'hote, desormais
-- creee eagerement, voir page.tsx) n'apparaissait qu'apres un rechargement
-- complet de la page. `rsvps` rejoint donc `messages`/`message_reactions`
-- dans la publication Realtime ; RLS continue de filtrer normalement ce que
-- chaque abonne recoit (meme mecanisme que pour le chat, cf. migration
-- 20260710000000).
alter publication supabase_realtime add table rsvps;

-- 2. Retirer le role admin d'un participant ne doit jamais laisser
-- l'evenement sans aucun admin explicite (role='admin', approved) : l'hote
-- a toujours un pouvoir implicite via is_event_host, mais un evenement sans
-- aucune ligne "admin" visible est une source de confusion et de risque
-- (plus personne ne se voit visuellement responsable de la moderation).
create or replace function set_participant_role(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
  v_current_role text;
  v_other_admins integer;
begin
  if p_role not in ('guest', 'admin', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status, role into v_event_id, v_status, v_current_role from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'approved' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  if v_current_role = 'admin' and p_role <> 'admin' then
    select count(*) into v_other_admins
    from rsvps
    where event_id = v_event_id and status = 'approved' and role = 'admin' and id <> p_rsvp_id;

    if v_other_admins = 0 then
      raise exception 'last admin cannot be demoted';
    end if;
  end if;

  update rsvps set role = p_role, updated_at = now() where id = p_rsvp_id;
end;
$$;

-- 3. `edit_own_message` : le compositeur n'a jamais permis d'envoyer une
-- photo accompagnee d'un texte (voir MessageComposer.tsx, deux boutons
-- d'envoi exclusifs) et l'affichage (MessageBubble.tsx) est lui aussi
-- exclusif (photo OU texte, jamais les deux). Editer un message revient donc
-- toujours a le remplacer par du texte pur : sans cela, editer un message
-- photo pour le remplacer par du texte laissait `photo_url` intact, et
-- l'affichage continuait a montrer l'ancienne photo au lieu du nouveau texte.
create or replace function edit_own_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_is_system boolean;
  v_created_at timestamptz;
begin
  select rsvp_id, is_system, created_at into v_rsvp_id, v_is_system, v_created_at
  from messages where id = p_message_id;

  if v_rsvp_id is null then
    raise exception 'message not found';
  end if;

  if not is_my_rsvp(v_rsvp_id) then
    raise exception 'not authorized';
  end if;

  if v_is_system then
    raise exception 'system messages cannot be edited';
  end if;

  if v_created_at < now() - interval '30 seconds' then
    raise exception 'edit window expired';
  end if;

  update messages set body = p_body, photo_url = null where id = p_message_id;
end;
$$;
