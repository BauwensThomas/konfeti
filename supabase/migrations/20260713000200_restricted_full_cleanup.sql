-- Retour Thomas : "être certain que si quelqu'un dit qu'il ne participe pas
-- à l'event ou le quitte, que toutes les choses qu'il apporte, les sondages
-- de lui et ses +1 disparaîtront et que le chat viendra avec un nom anonyme
-- avec une photo de profil anonyme." `leave_or_remove_participant` faisait
-- déjà tout ça ; `update_my_answer` (chemin "Je ne peux pas") ne retirait
-- que poll_votes/bring_claims/propositions en attente, jamais les
-- accompagnants, et n'anonymisait jamais l'identité (donc le chat gardait
-- le vrai nom). Alignée ici sur le même comportement, à une différence
-- près : "Je ne peux pas" reste RÉVERSIBLE (on peut revenir sur "je viens"),
-- contrairement à quitter -- l'identité est donc restaurée depuis `profiles`
-- (tenue à jour à chaque RSVP, voir `submitRsvp`) plutôt que redemandée.
create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
  v_profile_id uuid;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status, profile_id into v_status, v_profile_id from rsvps where id = p_rsvp_id;

  if p_answer = 'no' then
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
  elsif v_status = 'restricted' then
    -- Retour sur "je viens"/"peut-être" : identité reprise depuis `profiles`
    -- (jamais touchée par l'anonymisation ci-dessus), pour ne pas obliger un
    -- nouveau formulaire complet à chaque changement d'avis.
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
