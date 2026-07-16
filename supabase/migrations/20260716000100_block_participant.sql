-- Blocage definitif d'un participant sur UN evenement (retour Thomas, en
-- validant le plan de la Phase 9) : retirer quelqu'un d'un evenement
-- "ouvert" (n'importe qui avec le lien peut rejoindre) ne l'empeche pas de
-- revenir -- `create_own_rsvp` reactive automatiquement l'ancienne ligne des
-- qu'elle a le statut 'removed'/'left' (voir 20260710001200), precisement
-- pour permettre a un participant parti par erreur de revenir. Il manquait
-- un moyen de dire "non, JAMAIS cette personne, sur cet evenement".
alter table rsvps add column blocked boolean not null default false;

-- Meme garde que leave_or_remove_participant (is_event_admin) et meme
-- nettoyage des engagements, MAIS ne touche jamais a l'identite
-- (contrairement a un retrait classique) : contrairement a "Retirer"/"Quitter"
-- (protection de la vie privee de quelqu'un qui part), bloquer est une action
-- deliberee contre une personne precise -- l'admin doit continuer a la
-- reconnaitre dans la section "Bloques" pour pouvoir la debloquer plus tard.
-- Fonction dediee plutot que d'alourdir la signature de
-- leave_or_remove_participant (ne change aucun appelant existant).
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

  -- Meme nettoyage des engagements que leave_or_remove_participant (n'a plus
  -- lieu d'etre une fois la personne 'removed').
  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from companions where rsvp_id = p_rsvp_id;

  update rsvps set
    status = 'removed',
    blocked = true,
    updated_at = now()
  where id = p_rsvp_id;
end;
$$;

-- Debloquer ne reintegre PAS automatiquement (la personne reste 'removed') --
-- elle pourra simplement resoumettre son identite normalement, et etre
-- reactivee par create_own_rsvp comme n'importe quel retour.
create or replace function admin_unblock_participant(p_rsvp_id uuid)
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

  update rsvps set blocked = false, updated_at = now() where id = p_rsvp_id;
end;
$$;

-- create_own_rsvp refuse desormais la reactivation d'une ligne bloquee (au
-- lieu de la reactiver silencieusement comme n'importe quel retour). Reprend
-- ici la signature ACTUELLE de la fonction (returns uuid, plus de guest_code
-- depuis 20260713000100_remove_anonymous_sessions.sql) -- pas l'ancienne
-- version d'avant cette date.
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
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_status text;
  v_existing_id uuid;
  v_existing_status text;
  v_existing_blocked boolean;
begin
  select id, status, blocked into v_existing_id, v_existing_status, v_existing_blocked
  from rsvps
  where event_id = p_event_id and profile_id = (select auth.uid());

  if v_existing_id is not null and v_existing_blocked then
    raise exception 'participant is blocked';
  end if;

  if v_existing_id is not null and v_existing_status not in ('removed', 'left') then
    raise exception 'une participation existe deja pour cet evenement';
  end if;

  v_status := case when p_answer = 'no' then 'restricted' else 'pending' end;

  if v_existing_id is not null then
    update rsvps set
      first_name = p_first_name,
      last_name = p_last_name,
      phone = p_phone,
      gender = p_gender,
      avatar_kind = p_avatar_kind,
      avatar_value = p_avatar_value,
      status = v_status,
      role = 'guest',
      answer = p_answer,
      is_anonymized = false,
      updated_at = now()
    where id = v_existing_id;
    v_rsvp_id := v_existing_id;
  else
    insert into rsvps (
      event_id, profile_id, first_name, last_name, phone, gender,
      avatar_kind, avatar_value, status, role, answer
    ) values (
      p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
      p_avatar_kind, p_avatar_value, v_status, 'guest', p_answer
    )
    returning id into v_rsvp_id;
  end if;

  return v_rsvp_id;
end;
$$;

-- Nouvelles fonctions : EXECUTE est accorde a PUBLIC par defaut a la
-- creation, meme regle que le reste du projet (voir
-- 20260706103734_revoke_anon_function_access.sql) -- a revoquer/regrant
-- explicitement. create_own_rsvp n'a pas besoin de ce traitement ici : ses
-- grants existants (deja restreints a authenticated depuis
-- 20260713000100_remove_anonymous_sessions.sql) survivent a `create or
-- replace` (seul `drop function` les efface, pas utilise ici puisque la
-- signature/le type de retour ne changent pas).
revoke execute on function admin_block_participant(uuid) from public, anon;
grant execute on function admin_block_participant(uuid) to authenticated;
revoke execute on function admin_unblock_participant(uuid) from public, anon;
grant execute on function admin_unblock_participant(uuid) to authenticated;
