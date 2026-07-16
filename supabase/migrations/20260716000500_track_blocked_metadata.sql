-- Retour Thomas (Phase 9, back-office) : une vue globale (tous événements)
-- des personnes bloquées, avec la date du blocage et l'IP utilisée à la
-- dernière soumission -- utile pour repérer un même fauteur de troubles qui
-- reviendrait sous un autre compte.
alter table rsvps add column last_ip text;
alter table rsvps add column blocked_at timestamptz;

-- admin_block_participant pose désormais aussi blocked_at (jamais l'IP ici :
-- ce serait celle de l'ADMIN qui clique, pas celle de la personne bloquée --
-- voir last_ip, alimentée à chaque soumission par le participant lui-même).
create or replace function admin_block_participant(p_rsvp_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
begin
  select event_id into v_event_id from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from companions where rsvp_id = p_rsvp_id;

  update rsvps set
    status = 'removed',
    blocked = true,
    blocked_at = now(),
    updated_at = now()
  where id = p_rsvp_id;
end;
$$;
