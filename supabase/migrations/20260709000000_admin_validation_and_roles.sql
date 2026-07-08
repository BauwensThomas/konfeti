-- Validation par les administrateurs et roles (Phase 4, brief 1.3/1.4/1.5).
--
-- `status`/`role` restent hors de portee des grants clients sur `rsvps`
-- (voir 20260706101047_rls_policies.sql) : toute transition passe par une
-- fonction `security definer` dediee, sur le modele de `create_own_rsvp`.

-- Correctif : `leave_or_remove_participant` appelle `is_my_rsvp`/`is_event_admin`
-- sans prefixe, mais ces fonctions ont ete deplacees dans le schema `private`
-- par une migration ulterieure (20260706105349) sans que celle-ci soit
-- corrigee en consequence. Comme elle n'etait appelee nulle part jusqu'ici,
-- le bug etait invisible ; cette Phase 4 la cable enfin, donc le corriger
-- devient necessaire.
alter function leave_or_remove_participant(uuid, text) set search_path = public, private;

-- Repond "je peux pas" ne declenche jamais de validation admin (brief 1.3) :
-- la ligne est directement creee en acces restreint plutot qu'en attente.
create or replace function create_own_rsvp(
  p_event_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_gender text,
  p_avatar_kind text,
  p_avatar_value text,
  p_answer text
)
returns table (rsvp_id uuid, guest_code text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_guest_code text;
  v_status text;
begin
  if exists (
    select 1 from rsvps where event_id = p_event_id and profile_id = (select auth.uid())
  ) then
    raise exception 'une participation existe deja pour cet evenement';
  end if;

  v_guest_code := generate_guest_code();
  v_status := case when p_answer = 'no' then 'restricted' else 'pending' end;

  insert into rsvps (
    event_id, profile_id, first_name, last_name, phone, gender,
    avatar_kind, avatar_value, status, role, answer, guest_code
  ) values (
    p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
    p_avatar_kind, p_avatar_value, v_status, 'guest', p_answer, v_guest_code
  )
  returning id into v_rsvp_id;

  return query select v_rsvp_id, v_guest_code;
end;
$$;

-- Un admin valide une demande en attente en lui attribuant un role (jamais
-- "admin" directement par ce chemin : promouvoir un participant deja
-- approuve est une action separee, voir `set_participant_role`).
create or replace function admin_approve_rsvp(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  if p_role not in ('guest', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'pending' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set
    status = 'approved',
    role = p_role,
    approved_by = (select auth.uid()),
    approved_at = now(),
    updated_at = now()
  where id = p_rsvp_id;
end;
$$;

revoke execute on function admin_approve_rsvp(uuid, text) from public, anon;
grant execute on function admin_approve_rsvp(uuid, text) to authenticated;

-- Change le role d'un participant deja approuve (invite <-> admin <-> beneficiaire).
create or replace function set_participant_role(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  if p_role not in ('guest', 'admin', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'approved' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set role = p_role, updated_at = now() where id = p_rsvp_id;
end;
$$;

revoke execute on function set_participant_role(uuid, text) from public, anon;
grant execute on function set_participant_role(uuid, text) to authenticated;

-- Un participant change librement sa reponse a tout moment (decision produit :
-- pas de "reconsideration" a sens unique, voir doc/DECISIONS.md). "Je peux
-- pas" bascule immediatement en acces restreint (jamais de validation admin) ;
-- revenir sur "je viens"/"peut-etre" depuis restricted renvoie dans le
-- circuit normal de validation (brief 1.3). Le role d'un participant qui
-- retombe en pending/restricted redevient sans effet de lui-meme : les
-- fonctions RLS (my_rsvp_role, is_event_admin...) n'en tiennent compte que
-- si status = 'approved', donc aucun nettoyage supplementaire n'est requis.
create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status into v_status from rsvps where id = p_rsvp_id;

  if p_answer = 'no' then
    update rsvps set answer = p_answer, status = 'restricted', updated_at = now() where id = p_rsvp_id;
  elsif v_status = 'restricted' then
    update rsvps set answer = p_answer, status = 'pending', updated_at = now() where id = p_rsvp_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

revoke execute on function update_my_answer(uuid, text) from public, anon;
grant execute on function update_my_answer(uuid, text) to authenticated;
