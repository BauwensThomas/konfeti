-- Decision produit (question directe de Thomas apres avoir teste le parcours
-- "je ne peux pas") : l'acces "cagnotte seule" (brief 1.3) etait accorde
-- instantanement a QUICONQUE recevait le lien et repondait "je ne peux pas",
-- sans aucune validation de l'hote. Thomas a choisi de durcir : la cagnotte
-- ne s'affiche desormais qu'apres une autorisation explicite d'un admin.

alter table rsvps add column pot_access_granted boolean not null default false;

-- Cote lecture : remplace is_event_restricted_participant seul par une
-- verification qui exige aussi pot_access_granted sur SA PROPRE ligne. Policy
-- recreee avec le prefixe private. (convention pour toute nouvelle policy,
-- voir 20260706105349_move_rls_helpers_to_private_schema.sql).
create function private.has_pot_access(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from rsvps
    where event_id = p_event_id
      and profile_id = (select auth.uid())
      and status = 'restricted'
      and pot_access_granted
  );
$$;

revoke execute on function private.has_pot_access(uuid) from public, anon;
grant execute on function private.has_pot_access(uuid) to authenticated;

drop policy "events_pot_data_select" on events_pot_data;
create policy "events_pot_data_select" on events_pot_data
  for select to authenticated
  using (
    status = 'active'
    and (
      private.has_pot_access(id)
      or private.is_event_approved_participant(id)
      or private.is_event_admin(id)
    )
  );

-- Cote ecriture : seul un admin peut accorder cet acces, et seulement sur une
-- ligne encore "restricted" (une fois approuvee/retiree, ce n'est plus le bon
-- levier).
create function grant_pot_access(p_rsvp_id uuid)
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

  update rsvps set pot_access_granted = true, updated_at = now() where id = p_rsvp_id;
end;
$$;

revoke execute on function grant_pot_access(uuid) from public, anon;
grant execute on function grant_pot_access(uuid) to authenticated;
