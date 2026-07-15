-- Retour Thomas : "si je dis que je ne viens pas et que j'ai des +1, les
-- votes restent quand même... à apporter aussi ne se retire pas" -- la
-- branche "reste admin invisible" (organisateur/porteur de cagnotte
-- répondant "non") de la migration précédente ne faisait QUE changer
-- `answer`, en oubliant le nettoyage des engagements (votes, qui-apporte-
-- quoi, accompagnants, sondage de dates, playlist) que fait déjà la branche
-- normale juste en dessous. Ce nettoyage n'a rien à voir avec le statut/
-- l'anonymisation (qu'on ne touche toujours pas ici) -- il doit s'appliquer
-- de la même façon, peu importe qui répond "non".
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
  v_keep_visible_admin boolean;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status, profile_id, event_id into v_status, v_profile_id, v_event_id from rsvps where id = p_rsvp_id;

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
