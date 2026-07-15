-- Retour Thomas : "je vois Julie Dean a rejoint la fête, mais si Julie
-- quitte, ça va être marqué Anonyme a rejoint la fête à la place de Julie...
-- je veux juste 1x elle a rejoint et si elle quitte X a quitté, et si elle
-- revient plus tard, X a rejoint etc." -- le message "a rejoint" (seul type
-- de message système qui existait) résout le prénom EN DIRECT via rsvp_id
-- (voir commentaire de `admin_approve_rsvp`, chat_phase5.sql) : un choix
-- volontaire à l'époque (pour que revenir après un départ restaure le nom
-- sur les VRAIS messages déjà postés), mais qui casse spécifiquement les
-- messages système : eux représentent un événement figé dans le temps
-- ("X a rejoint CE jour-là"), pas une identité qui doit rester à jour.
--
-- Fix : le nom est désormais figé dans le message lui-même au moment de sa
-- création (jamais recalculé après), et un vrai message "left" apparaît
-- symétriquement au départ (répondre "non" OU quitter l'événement).

alter table messages add column if not exists system_author_name text;

-- ============================================================
-- admin_approve_rsvp : fige le prénom+nom dans le message "joined"
-- ============================================================
create or replace function admin_approve_rsvp(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
  v_first_name text;
  v_last_name text;
begin
  if p_role not in ('guest', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status, first_name, last_name
  into v_event_id, v_status, v_first_name, v_last_name
  from rsvps where id = p_rsvp_id;
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

  insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
  values (v_event_id, p_rsvp_id, 'main', true, 'joined', trim(concat_ws(' ', v_first_name, v_last_name)));
end;
$$;

-- ============================================================
-- update_my_answer : message "left" figé AVANT anonymisation (les 2
-- branches "non", "reste admin invisible" et normale)
-- ============================================================
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
    delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

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
    delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

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

-- ============================================================
-- leave_or_remove_participant : même message "left" figé
-- ============================================================
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
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

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
