-- Bug produit signale par Thomas : `pot_access_granted`/`wants_pot_access`
-- ne sont jamais remis a zero quand un participant restricted revient sur
-- "je viens"/"peut-etre" (update_my_answer, branche restricted -> pending).
-- S'il repasse plus tard sur "je ne peux pas", l'ANCIEN accord ressurgit
-- instantanement (has_pot_access redevient vrai des que status='restricted'),
-- sans nouvelle demande ni nouvelle decision admin -- Thomas retombait sur
-- "acces cagnotte autorise" dans Personnes sans avoir rien fait ce cycle-ci.
--
-- Correctif 1 : quitter le statut restricted remet ces deux colonnes a
-- false -- un retour ulterieur sur "je ne peux pas" redemarre le parcours de
-- zero (demande -> decision admin), exactement comme la premiere fois.
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
    update rsvps set
      answer = p_answer,
      status = 'pending',
      wants_pot_access = false,
      pot_access_granted = false,
      updated_at = now()
    where id = p_rsvp_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

-- Correctif 2 : demande explicite de Thomas ("pouvoir mettre annule au cas
-- ou il change d'avis") -- un admin doit pouvoir revoquer un acces deja
-- accorde, symetrique de grant_pot_access/deny_pot_access. Pas de contrainte
-- sur le statut courant (contrairement a grant/deny) : revoquer doit rester
-- possible quel que soit l'etat actuel, purement defensif (has_pot_access
-- exige de toute facon status='restricted' pour avoir un quelconque effet).
create function revoke_pot_access(p_rsvp_id uuid)
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

  update rsvps set pot_access_granted = false, wants_pot_access = false, updated_at = now() where id = p_rsvp_id;
end;
$$;

revoke execute on function revoke_pot_access(uuid) from public, anon;
grant execute on function revoke_pot_access(uuid) to authenticated;
