-- Corrections suite au Security Advisor de Supabase.

-- 1. touch_updated_at n'avait pas de search_path fixe (bonne pratique meme sans security definer)
create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. events_public_preview / events_pot_preview / rsvps_public : marquees "Security Definer View"
-- par l'Advisor car elles n'utilisent pas security_invoker (volontaire, voir doc/ARCHITECTURE.md :
-- elles verifient elles-memes l'autorisation via des fonctions security definer, pour afficher une
-- liste "publique" au-dela de ce qu'autoriserait la RLS ligne par ligne sur la table brute).
-- security_barrier ajoute une protection supplementaire : le planificateur ne peut plus faire
-- fuiter des lignes via une optimisation qui evaluerait les conditions du client avant celles de
-- la vue (attaque par effet de bord/erreur). Defense en profondeur, ne change pas le comportement.
alter view events_public_preview set (security_barrier = true);
alter view events_pot_preview set (security_barrier = true);
alter view rsvps_public set (security_barrier = true);

-- 3. scheduled_messages : RLS activee sans aucune policy (donc totalement fermee a anon/authenticated,
-- seul service_role peut y toucher). C'est voulu, mais l'Advisor signale les tables RLS sans policy.
-- On rend l'intention explicite avec une policy qui refuse tout, sans rien changer au comportement reel.
create policy "scheduled_messages_no_client_access" on scheduled_messages
  for all to authenticated, anon
  using (false)
  with check (false);
