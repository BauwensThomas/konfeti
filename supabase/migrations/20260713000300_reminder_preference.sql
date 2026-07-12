-- Retour Thomas : "dans le profil il faut pouvoir cocher ou décocher de
-- recevoir les mails." `rsvps.wants_reminders` (migration 20260712000300)
-- n'existait que par événement, coché une seule fois à l'inscription
-- (`GuestIdentityForm`), jamais modifiable ensuite. Réglage global ajouté
-- sur `profiles`, éditable à tout moment depuis /profil -- appliqué
-- immédiatement à toutes les participations approuvées en cours (sinon
-- changer ce réglage n'aurait aucun effet sur les rappels déjà programmés).
-- Le choix par événement à l'inscription (`GuestIdentityForm`) reste
-- inchangé : ce réglage global ne fait que s'y ajouter, jamais pré-coché ni
-- modifié automatiquement par lui (choix délibéré déjà en place, voir
-- `src/lib/validation/rsvp.ts`). Réglage global actif PAR DÉFAUT (retour
-- Thomas explicite, différent du choix par événement) : `default true`.
alter table profiles add column if not exists wants_reminders boolean not null default true;

create or replace function update_reminder_preference(p_wants_reminders boolean)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update profiles set wants_reminders = p_wants_reminders where id = auth.uid();
  update rsvps set wants_reminders = p_wants_reminders, updated_at = now()
  where profile_id = auth.uid() and status = 'approved';
end;
$$;

revoke execute on function update_reminder_preference(boolean) from public, anon;
grant execute on function update_reminder_preference(boolean) to authenticated;
