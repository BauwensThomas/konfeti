-- Retrait des sessions anonymes (retour Thomas) : "un compte anonyme c'est
-- trop de problème, impossible de ravoir le code si on a oublié... que les
-- gens se connectent à leur compte directement". Décision explicite après
-- discussion (Google OAuth ~15 secondes, l'argument friction ne tient pas) :
-- tout le monde doit désormais se connecter (Google ou e-mail) pour
-- participer à un événement. La RLS elle-même n'a rien à changer (toutes
-- les policies accordent au rôle générique `authenticated`, qu'une session
-- anonyme porte aussi) -- seules les fonctions ci-dessous, propres au
-- système de code de récupération et au badge "vrai compte", disparaissent.

-- `create_own_rsvp` : plus de génération/retour de guest_code. Le type de
-- retour change (table(rsvp_id, guest_code) -> uuid) : `create or replace`
-- refuse ça (42P13, "cannot change return type of existing function"), il
-- faut dropper explicitement l'ancienne signature d'abord.
drop function if exists create_own_rsvp(uuid, text, text, text, text, text, text, text);

create function create_own_rsvp(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_gender text,
  p_avatar_kind text,
  p_avatar_value text,
  p_answer text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_status text;
  v_existing_id uuid;
  v_existing_status text;
begin
  select id, status into v_existing_id, v_existing_status
  from rsvps
  where event_id = p_event_id and profile_id = (select auth.uid());

  if v_existing_id is not null and v_existing_status not in ('removed', 'left') then
    raise exception 'une participation existe deja pour cet evenement';
  end if;

  v_status := case when p_answer = 'no' then 'restricted' else 'pending' end;

  if v_existing_id is not null then
    update rsvps set
      first_name = p_first_name,
      last_name = p_last_name,
      phone = p_phone,
      gender = p_gender,
      avatar_kind = p_avatar_kind,
      avatar_value = p_avatar_value,
      status = v_status,
      role = 'guest',
      answer = p_answer,
      is_anonymized = false,
      updated_at = now()
    where id = v_existing_id;
    v_rsvp_id := v_existing_id;
  else
    insert into rsvps (
      event_id, profile_id, first_name, last_name, phone, gender,
      avatar_kind, avatar_value, status, role, answer
    ) values (
      p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
      p_avatar_kind, p_avatar_value, v_status, 'guest', p_answer
    )
    returning id into v_rsvp_id;
  end if;

  return v_rsvp_id;
end;
$$;

-- `drop function` efface aussi les privilèges de l'ancienne fonction : à
-- réappliquer explicitement (même règle qu'à l'origine, sans quoi PUBLIC/anon
-- récupèrent le droit d'exécuter par défaut).
revoke execute on function create_own_rsvp(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function create_own_rsvp(uuid, text, text, text, text, text, text, text) to authenticated;

drop function if exists redeem_guest_code(text);
drop function if exists generate_guest_code();

alter table rsvps drop column if exists guest_code;

-- Un admin en session anonyme ne peut plus exister : le garde-fou anti-
-- transfert vers un tel admin n'a plus de raison d'être.
create or replace function transfer_event_host(p_event_id uuid, p_new_host_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_new_host_status text;
  v_new_host_role text;
begin
  if not is_event_host(p_event_id) then
    raise exception 'not authorized';
  end if;

  select status, role into v_new_host_status, v_new_host_role
  from rsvps
  where event_id = p_event_id and profile_id = p_new_host_profile_id;

  if v_new_host_status is distinct from 'approved' or v_new_host_role <> 'admin' then
    raise exception 'new host must be an approved admin';
  end if;

  update events set host_id = p_new_host_profile_id where id = p_event_id;
end;
$$;

-- N'existait que pour afficher le badge "vrai compte"/désactiver le
-- transfert d'organisation vers un admin anonyme, dans l'onglet Personnes.
drop function if exists get_event_participants_account_type(uuid);

-- `leave_or_remove_participant` et `delete_own_account` mettaient toutes
-- deux `guest_code = null` dans leur anonymisation -- colonne supprimée
-- ci-dessus, ces deux fonctions doivent être redéfinies sans cette ligne
-- (sans quoi le premier appel après cette migration échouerait : colonne
-- inexistante).
create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id into v_event_id from rsvps where id = p_rsvp_id;
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

  -- La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
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

  for v_rsvp in
    select id from rsvps where profile_id = v_uid and status not in ('left', 'removed')
  loop
    delete from poll_votes where rsvp_id = v_rsvp.id;
    delete from polls where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from date_votes where rsvp_id = v_rsvp.id;
    delete from bring_claims where rsvp_id = v_rsvp.id;
    delete from bring_items where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from companions where rsvp_id = v_rsvp.id;
    delete from playlist_suggestions where rsvp_id = v_rsvp.id and added_to_playlist = false;

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
  update events set pot_owner = null where pot_owner = v_uid;
end;
$$;
