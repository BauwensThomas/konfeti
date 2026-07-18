-- Retrait de la table morte `playlist_suggestions` (résidu de la Phase 8,
-- Playlist Spotify, entièrement retirée du produit -- voir DECISIONS.md).
-- Elle avait déjà été retirée de la publication Realtime au moment du
-- retrait de Spotify (20260715000200), mais jamais supprimée elle-même.
--
-- `drop table` seul ne suffit pas ici : trois fonctions `security definer`
-- toujours actives (`leave_or_remove_participant`, `update_my_answer`,
-- `delete_own_account`) contiennent encore un `delete from
-- playlist_suggestions ...` de nettoyage dans leur corps. PL/pgSQL ne
-- vérifie pas les dépendances de table à la création d'une fonction (le
-- corps est un texte opaque pour le planificateur), donc `drop table`
-- réussirait sans erreur -- mais la ligne DELETE ferait planter ces trois
-- fonctions (quitter un événement, changer de réponse, supprimer son
-- compte) au prochain appel réel avec "relation playlist_suggestions does
-- not exist". Les trois sont donc redéfinies ici sans cette ligne, corps
-- identique sinon à leur dernière version (20260715000200 / 20260716000700
-- / 20260714000500), avant le `drop table`.

create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_profile_id uuid;
  v_first_name text;
  v_last_name text;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id, profile_id, first_name, last_name
  into v_event_id, v_profile_id, v_first_name, v_last_name
  from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'the organizer cannot leave or be removed, transfer the organization first';
  end if;

  if exists (
    select 1 from events
    where id = v_event_id and pot_owner = v_profile_id and pot_enabled = true and pot_closed_at is null
  ) then
    raise exception 'still owns an active pot, transfer or close it first';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from companions where rsvp_id = p_rsvp_id;

  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    updated_at = now()
  where id = p_rsvp_id;

  insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
  values (v_event_id, p_rsvp_id, 'main', true, 'left', trim(concat_ws(' ', v_first_name, v_last_name)));

  -- La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
  v_profile_id uuid;
  v_event_id uuid;
  v_first_name text;
  v_last_name text;
  v_keep_visible_admin boolean;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status, profile_id, event_id, first_name, last_name
  into v_status, v_profile_id, v_event_id, v_first_name, v_last_name
  from rsvps where id = p_rsvp_id;

  v_keep_visible_admin := exists (
    select 1 from events
    where id = v_event_id
      and (host_id = v_profile_id or (pot_owner = v_profile_id and pot_enabled = true and pot_closed_at is null))
  );

  if p_answer = 'no' and v_keep_visible_admin then
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from companions where rsvp_id = p_rsvp_id;
    delete from date_votes where rsvp_id = p_rsvp_id;

    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;

    insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
    values (v_event_id, p_rsvp_id, 'main', true, 'left', trim(concat_ws(' ', v_first_name, v_last_name)));
  elsif p_answer = 'no' then
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from companions where rsvp_id = p_rsvp_id;
    delete from date_votes where rsvp_id = p_rsvp_id;

    update rsvps set
      answer = p_answer,
      status = 'restricted',
      is_anonymized = true,
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      updated_at = now()
    where id = p_rsvp_id;

    insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
    values (v_event_id, p_rsvp_id, 'main', true, 'left', trim(concat_ws(' ', v_first_name, v_last_name)));
  elsif v_status = 'restricted' then
    update rsvps r set
      answer = p_answer,
      status = 'pending',
      is_anonymized = false,
      first_name = p.first_name,
      last_name = p.last_name,
      phone = p.phone,
      avatar_kind = p.avatar_kind,
      avatar_value = p.avatar_value,
      wants_pot_access = false,
      pot_access_granted = false,
      updated_at = now()
    from profiles p
    where r.id = p_rsvp_id and p.id = v_profile_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_rsvp record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from events where host_id = v_uid) then
    raise exception 'still hosting events, transfer organization first';
  end if;

  if exists (
    select 1 from events
    where pot_owner = v_uid and pot_enabled = true and pot_closed_at is null
  ) then
    raise exception 'still owns an active pot, transfer or close it first';
  end if;

  for v_rsvp in
    select id from rsvps where profile_id = v_uid and status not in ('left', 'removed')
  loop
    delete from poll_votes where rsvp_id = v_rsvp.id;
    delete from polls where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from date_votes where rsvp_id = v_rsvp.id;
    delete from bring_claims where rsvp_id = v_rsvp.id;
    delete from bring_items where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from companions where rsvp_id = v_rsvp.id;

    update rsvps set
      is_anonymized = true,
      status = 'left',
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      profile_id = null,
      updated_at = now()
    where id = v_rsvp.id;
  end loop;

  update rsvps set profile_id = null where profile_id = v_uid;
  update rsvps set approved_by = null where approved_by = v_uid;
  -- Sans risque ici : le garde-fou plus haut a déjà bloqué toute cagnotte
  -- encore ACTIVE -- une référence `pot_owner` restante à ce stade ne peut
  -- venir que d'une cagnotte déjà fermée, sans lien de routage à préserver.
  update events set pot_owner = null where pot_owner = v_uid;
end;
$$;

drop table if exists playlist_suggestions cascade;
