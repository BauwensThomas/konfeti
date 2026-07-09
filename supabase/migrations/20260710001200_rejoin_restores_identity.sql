-- Decision produit (Thomas) : si une personne qui a quitte (statut "left")
-- OU qui a ete retiree par un admin (statut "removed") revient plus tard sur
-- le meme evenement, elle doit retrouver son vrai nom PARTOUT, y compris sur
-- ses anciens messages de chat -- pas seulement sur une nouvelle ligne
-- fraiche qui laisserait l'ancienne anonyme pour toujours.
--
-- Jusqu'ici, l'anonymisation (leave_or_remove_participant) remettait aussi
-- `profile_id` a null, coupant tout lien retrouvable entre le compte reel et
-- son ancienne ligne rsvps -- un retour creait donc systematiquement une
-- TOUTE NOUVELLE ligne (aucune contrainte unique ne s'y opposait, puisque
-- `rsvps_event_profile_unique` ne porte que sur profile_id non-null), et
-- l'ancienne ligne (et tous les messages qui pointent dessus) restait
-- anonyme pour de bon.
--
-- Correctif : ne plus jamais nullifier profile_id a l'anonymisation (rien
-- d'autre n'en depend cote confidentialite -- jamais expose via
-- rsvps_public_data). `create_own_rsvp` reconnait alors l'ancienne ligne au
-- retour (meme profile_id, meme evenement) et la REACTIVE (identite/statut
-- remis a neuf) plutot que d'echouer ou d'en creer une seconde -- restaurant
-- du meme coup le nom sur tout l'historique de chat deja lie a ce rsvp_id.

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

-- Reactive une ancienne ligne anonymisee (meme compte, meme evenement) au
-- lieu d'en creer une seconde ou d'echouer : identite/statut remis a neuf,
-- le rsvp_id (et donc tout son historique de chat) reste le meme.
create or replace function create_own_rsvp(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_gender text,
  p_avatar_kind text,
  p_avatar_value text,
  p_answer text
)
returns table (rsvp_id uuid, guest_code text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_guest_code text;
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

  v_guest_code := generate_guest_code();
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
      guest_code = v_guest_code,
      is_anonymized = false,
      updated_at = now()
    where id = v_existing_id;
    v_rsvp_id := v_existing_id;
  else
    insert into rsvps (
      event_id, profile_id, first_name, last_name, phone, gender,
      avatar_kind, avatar_value, status, role, answer, guest_code
    ) values (
      p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
      p_avatar_kind, p_avatar_value, v_status, 'guest', p_answer, v_guest_code
    )
    returning id into v_rsvp_id;
  end if;

  return query select v_rsvp_id, v_guest_code;
end;
$$;
