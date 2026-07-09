-- Correctif decouvert en verifiant visuellement le chat (Phase 5) : la ligne
-- rsvps auto-creee pour l'hote (ensure_own_rsvp, Phase 3) ne recopiait
-- jamais son identite (first_name/last_name/avatar) depuis profiles,
-- laissant ces colonnes a null. Sans consequence tant que rien n'affichait
-- le nom d'un participant a partir de sa ligne rsvps (le sondage de date ne
-- montre que des compteurs) — mais le chat resout l'auteur d'un message par
-- ce biais, donc l'hote apparaissait "Anonyme" sur ses propres messages.
create or replace function ensure_own_rsvp(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_profile profiles%rowtype;
begin
  select id into v_rsvp_id
  from rsvps
  where event_id = p_event_id and profile_id = (select auth.uid());

  if v_rsvp_id is not null then
    return v_rsvp_id;
  end if;

  if not private.is_event_host(p_event_id) then
    raise exception 'seul l''hote peut se creer une ligne rsvps automatiquement pour l''instant';
  end if;

  select * into v_profile from profiles where id = (select auth.uid());

  insert into rsvps (
    event_id, profile_id, first_name, last_name, avatar_kind, avatar_value,
    status, role, answer, approved_at
  )
  values (
    p_event_id, (select auth.uid()), v_profile.first_name, v_profile.last_name,
    v_profile.avatar_kind, v_profile.avatar_value, 'approved', 'admin', 'yes', now()
  )
  returning id into v_rsvp_id;

  return v_rsvp_id;
end;
$$;
