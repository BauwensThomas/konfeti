-- Bug réel trouvé en lançant la suite e2e complète : la suppression de
-- compte échouait systématiquement ("column guest_code of relation rsvps
-- does not exist"). `delete_own_account` était censée avoir été redéfinie
-- sans cette colonne par la migration 20260713000100 (retrait des sessions
-- anonymes, colonne supprimée dans la même migration) -- mais la version
-- réellement active en base était encore celle de 20260712000500 (sa toute
-- première création, qui référence encore `guest_code`). `create or
-- replace` ici pour forcer la bonne version, quelle que soit l'état actuel.
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
