-- Depart / suppression d'un participant (brief 1.5 et procedure 5.2).
-- security definer : doit pouvoir ecrire des colonnes hors de portee des grants clients
-- (status, guest_code, profile_id...), donc s'execute avec les privileges du proprietaire
-- de la fonction, apres avoir verifie lui-meme l'autorisation de l'appelant.

create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public
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
  --    via la jointure -- voir rsvps_public qui affichera first_name = null)
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
    profile_id = null,
    updated_at = now()
  where id = p_rsvp_id;

  -- 3. La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

grant execute on function leave_or_remove_participant(uuid, text) to authenticated;
