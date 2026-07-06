-- Sondage de date : chaque participant peut voter (cocher/décocher plusieurs
-- dates), seul l'admin peut figer la date choisie (demande de Thomas).
--
-- Prérequis manquant : pour voter, il faut une ligne `rsvps` (le vote est
-- rattaché à un `rsvp_id`, pas directement à l'utilisateur). Or l'hôte n'a
-- jamais de ligne rsvps créée automatiquement (voir DECISIONS.md, bug RLS du
-- 2026-07-06). Comme l'identité invité / double porte (Phase 3, à venir) ne
-- sont pas encore construites, personne d'autre que l'hôte ne peut de toute
-- façon accéder à un événement aujourd'hui. Cette fonction se contente donc
-- de garantir que L'HÔTE a bien sa propre ligne rsvps (admin, approuvée) au
-- moment où il vote pour la première fois. Elle est volontairement limitée à
-- l'hôte pour l'instant : la création d'une ligne rsvps pour un vrai invité
-- (avec approbation, rôle, etc.) reste un chantier à part (Phase 4).
--
-- `security definer` : une insertion classique via le client ne peut pas
-- positionner `status`/`role` (colonnes réservées, voir grants sur `rsvps`
-- dans 20260706101047_rls_policies.sql) ; il faut donc passer par une
-- fonction privilégiée, comme `leave_or_remove_participant`.
create or replace function ensure_own_rsvp(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
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

  insert into rsvps (event_id, profile_id, status, role, answer, approved_at)
  values (p_event_id, (select auth.uid()), 'approved', 'admin', 'yes', now())
  returning id into v_rsvp_id;

  return v_rsvp_id;
end;
$$;

revoke execute on function ensure_own_rsvp(uuid) from public, anon;
grant execute on function ensure_own_rsvp(uuid) to authenticated;
