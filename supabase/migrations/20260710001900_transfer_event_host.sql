-- Retour Thomas : impossible aujourd'hui pour l'hote (createur) de quitter
-- son propre evenement, meme apres avoir promu un autre admin -- host_id est
-- une colonne fixe sur `events`, jamais transferee, et is_event_host (donc
-- is_event_admin) reste vrai pour l'hote quoi qu'il arrive a sa ligne rsvps.
-- Decision (question posee a Thomas, option retenue) : un transfert EXPLICITE
-- de l'organisation vers un autre admin deja approuve, avant de pouvoir
-- utiliser le circuit normal "Quitter l'evenement" (leave_or_remove_participant,
-- deja en place). Jamais un simple update client-side de `host_id` (la policy
-- events_update_by_admin autoriserait n'importe quel admin a le faire vers
-- n'importe quel profil, meme pas admin) : fonction dediee qui verifie a la
-- fois que l'appelant est bien l'HOTE actuel (pas un admin promu) et que la
-- cible est deja un admin approuve de cet evenement.
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

grant execute on function transfer_event_host(uuid, uuid) to authenticated;
