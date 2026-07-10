-- Retour Thomas : "j'ai mon 2eme compte qui est admin, et je sais supprimer
-- ou changer le role de l'organisateur. ce n'est pas logique ca." -- vrai
-- trou : `set_participant_role`/`leave_or_remove_participant` n'autorisaient
-- que sur `is_event_admin`, sans jamais verifier si la ligne CIBLEE etait
-- celle de l'organisateur (`events.host_id`). Un admin promu pouvait donc
-- retrograder ou "retirer" (anonymiser) l'organisateur, qui gardait ses
-- vrais pouvoirs (host_id inchange) mais se retrouvait dans un etat
-- incoherent (role corrompu, ou identite effacee alors qu'il a toujours
-- acces). Regles retenues (question posee a Thomas) :
-- 1. L'organisateur est intouchable, y compris pour lui-meme via ces deux
--    fonctions -- la seule facon d'arreter d'etre organisateur reste le
--    transfert explicite (transfer_event_host).
-- 2. Entre admins ordinaires (ni l'un ni l'autre organisateur) : egalite,
--    n'importe quel admin peut gerer n'importe quel autre admin (garde-fou
--    "jamais le dernier admin" deja en place, inchange).

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

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'cannot change the organizer role, transfer the organization instead';
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

  -- 1. Nettoyage des engagements (les jauges/ratios se recalculent automatiquement,
  --    puisqu'ils sont derives par comptage des lignes restantes)
  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  -- 2. Anonymisation de l'identite (les messages et pot_contributions restent, "Anonyme"
  --    via la jointure -- voir rsvps_public qui affichera first_name = null).
  --    profile_id N'EST PLUS nullifie (voir commentaire de migration ci-dessus) :
  --    le lien avec le compte reel reste pour permettre une reactivation propre
  --    si la personne revient un jour sur cet evenement.
  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    guest_code = null,
    updated_at = now()
  where id = p_rsvp_id;

  -- 3. La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;
