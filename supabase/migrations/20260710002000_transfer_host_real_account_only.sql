-- Retour Thomas : un admin en session anonyme ("code d'accès") qui devient
-- organisateur est un risque réel -- s'il perd sa session (cookies effacés,
-- autre appareil) et la récupère via son code d'invité, `redeem_guest_code`
-- ne réassigne que sa ligne `rsvps` (profile_id), jamais `events.host_id`.
-- L'événement se retrouverait avec un "organisateur" définitivement
-- inaccessible, sans plus aucun moyen de retransférer (seul l'organisateur
-- actuel peut le faire). Même raison que `createEvent` exige déjà un vrai
-- compte : l'organisateur doit avoir une identité durable.
create or replace function transfer_event_host(p_event_id uuid, p_new_host_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_new_host_status text;
  v_new_host_role text;
  v_new_host_is_anonymous boolean;
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

  select is_anonymous into v_new_host_is_anonymous
  from auth.users
  where id = p_new_host_profile_id;

  if v_new_host_is_anonymous then
    raise exception 'new host must have a real account, not an anonymous session';
  end if;

  update events set host_id = p_new_host_profile_id where id = p_event_id;
end;
$$;

-- Nécessaire pour que la liste Personnes puisse savoir qui a un vrai compte
-- (symbole visuel + masquer/expliquer "Transférer l'organisation" pour un
-- admin anonyme) : `auth.users` n'est pas exposée via l'API REST classique
-- ("Invalid schema: auth", confirmé en diagnostic), une fonction dédiée y
-- accède normalement en SQL. Réservée aux admins de l'événement concerné
-- (silencieusement 0 ligne sinon, même logique que les autres fonctions
-- `security definer` de lecture de ce projet).
create or replace function get_event_participants_account_type(p_event_id uuid)
returns table (profile_id uuid, is_anonymous boolean)
language sql
stable
security definer
set search_path = public, private
as $$
  select r.profile_id, u.is_anonymous
  from rsvps r
  join auth.users u on u.id = r.profile_id
  where r.event_id = p_event_id
    and is_event_admin(p_event_id);
$$;

grant execute on function get_event_participants_account_type(uuid) to authenticated;
