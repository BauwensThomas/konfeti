-- Identité invité + double porte (Phase 3, brief 1.1/1.2).
--
-- `status`, `role` et `guest_code` sont des colonnes de décision jamais
-- accordées en écriture directe au client (voir grants sur `rsvps` dans
-- 20260706101047_rls_policies.sql) : la création de sa propre ligne rsvps
-- passe donc par une fonction `security definer`, comme `ensure_own_rsvp`.
-- Les accompagnants (`companions`) restent insérés directement par le client
-- une fois la ligne rsvps créée : la policy `companions_write_own` suffit.

-- Génère un code personnel unique de récupération cross-device (ex.
-- "INVITE-4291"), même style que generateShortCode côté TS
-- (src/lib/short-code.ts), mais avec des mots différents pour ne jamais
-- confondre un guest_code avec le short_code d'un événement.
create or replace function generate_guest_code()
returns text
language plpgsql
as $$
declare
  words text[] := array['INVITE', 'GUEST', 'COPAIN', 'VOISIN', 'AMI', 'TEAM', 'CREW', 'GANG'];
  v_code text;
begin
  loop
    v_code := words[1 + floor(random() * array_length(words, 1))::int]
      || '-' || (1000 + floor(random() * 9000))::int;
    exit when not exists (select 1 from rsvps where guest_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Crée la ligne rsvps de l'appelant pour un événement donné (statut "pending",
-- rôle "guest" par défaut, brief 1.3 étape 3), avec un guest_code généré côté
-- serveur. Une seule participation par (event, profile) : voir aussi l'index
-- unique rsvps_event_profile_unique, qui reste le filet de sécurité final.
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
begin
  if exists (
    select 1 from rsvps where event_id = p_event_id and profile_id = (select auth.uid())
  ) then
    raise exception 'une participation existe deja pour cet evenement';
  end if;

  v_guest_code := generate_guest_code();

  insert into rsvps (
    event_id, profile_id, first_name, last_name, phone, gender,
    avatar_kind, avatar_value, status, role, answer, guest_code
  ) values (
    p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
    p_avatar_kind, p_avatar_value, 'pending', 'guest', p_answer, v_guest_code
  )
  returning id into v_rsvp_id;

  return query select v_rsvp_id, v_guest_code;
end;
$$;

revoke execute on function create_own_rsvp(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function create_own_rsvp(uuid, text, text, text, text, text, text, text) to authenticated;

-- Récupération cross-device (brief 1.2) : saisir son guest_code sur un
-- nouvel appareil rattache la participation existante à la session courante
-- (réelle ou anonyme). Retourne le short_code de l'événement pour rediriger.
create or replace function redeem_guest_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rsvp_id uuid;
  v_event_id uuid;
  v_short_code text;
begin
  select id, event_id into v_rsvp_id, v_event_id
  from rsvps
  where guest_code = p_code and is_anonymized = false;

  if v_rsvp_id is null then
    raise exception 'code invalide';
  end if;

  if exists (
    select 1 from rsvps
    where event_id = v_event_id
      and profile_id = (select auth.uid())
      and id <> v_rsvp_id
  ) then
    raise exception 'une participation existe deja sur cet evenement depuis cet appareil';
  end if;

  update rsvps set profile_id = (select auth.uid()) where id = v_rsvp_id;

  select short_code into v_short_code from events where id = v_event_id;
  return v_short_code;
end;
$$;

revoke execute on function redeem_guest_code(text) from public, anon;
grant execute on function redeem_guest_code(text) to authenticated;
