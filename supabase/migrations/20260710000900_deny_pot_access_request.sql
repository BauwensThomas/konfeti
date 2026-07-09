-- Affinage produit (Thomas, meme fil que la demande d'acces cagnotte en 2
-- temps) : un participant restreint qui n'a PAS demande a participer a la
-- cagnotte ne doit generer AUCUNE action pour l'admin (ni "autoriser" ni
-- "retirer") -- il est deja sans acces, rien a gerer. Seule une demande
-- explicite de sa part cree une vraie decision admin, symetrique a la file
-- d'attente normale : "Approuver" (grant_pot_access, deja en place) ou
-- "Refuser" (cette fonction), qui remet simplement wants_pot_access a false.
create function deny_pot_access(p_rsvp_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'restricted' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set wants_pot_access = false, updated_at = now() where id = p_rsvp_id;
end;
$$;

revoke execute on function deny_pot_access(uuid) from public, anon;
grant execute on function deny_pot_access(uuid) to authenticated;
