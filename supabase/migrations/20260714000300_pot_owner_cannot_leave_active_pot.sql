-- Retour Thomas : "si la personne qui a la cagnotte quitte... comment elle
-- va avoir le pdf avec les infos ?" -- répondre "je ne peux pas" (statut
-- restricted) ou quitter l'événement font tous deux perdre le statut admin
-- approuvé (donc l'accès au tableau de bord ET à l'export PDF), alors même
-- que cette personne continue de recevoir l'argent des nouvelles
-- contributions en coulisses (stripe_account_id n'est jamais touché par ces
-- deux fonctions).
--
-- Décision finale après discussion avec Thomas :
-- - "Quitter l'événement" reste BLOQUÉ tant qu'on porte une cagnotte encore
--   active (même garde-fou que `delete_own_account`) -- cette action
--   anonymise et retire complètement, incompatible avec rester responsable
--   de l'argent.
-- - "Je ne peux pas" (répondre "no"), en revanche, doit rester LIBRE pour
--   l'organisateur ou le porteur de cagnotte -- juste sans jamais perdre son
--   statut admin approuvé (jamais anonymisé, jamais rétrogradé en
--   "restricted") : il disparaît simplement de la liste des présents
--   ("Je viens"/"Peut-être", voir le filtre `approvedYes` de
--   `ParticipantsList.tsx`), tout en restant admin invisible dans l'event.

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

  -- Organisateur (host_id) OU porteur d'une cagnotte encore active : garde
  -- son statut admin approuvé tel quel, même en répondant "je ne peux pas".
  v_keep_visible_admin := exists (
    select 1 from events
    where id = v_event_id
      and (host_id = v_profile_id or (pot_owner = v_profile_id and pot_enabled = true and pot_closed_at is null))
  );

  if p_answer = 'no' and v_keep_visible_admin then
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

create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_profile_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id, profile_id into v_event_id, v_profile_id from rsvps where id = p_rsvp_id;
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

  -- La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;
