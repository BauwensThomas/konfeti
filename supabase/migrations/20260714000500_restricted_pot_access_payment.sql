-- Retour Thomas : "si j'approuve l'accès à la cagnotte... Cagnotte : Cadeau
-- pour son anniv, Montant libre, mais aucun moyen de faire un paiement" --
-- l'accès "cagnotte seule" (brief 1.3, `GuestRestrictedScreen`) n'a jamais
-- été branché au vrai formulaire de paiement (Phase 7, construit bien après
-- ce mécanisme) : il ne montrait que le libellé/objectif, jamais de bouton
-- "Contribuer". Pour router un vrai paiement il faut connaître `pot_owner`
-- (quel compte Stripe) et `pot_closed_at` (cagnotte encore ouverte ?), ni
-- l'un ni l'autre n'existaient dans `events_pot_data` (le mirror table
-- accessible à un participant restricted, `events` brute lui étant
-- inaccessible via RLS).

alter table events_pot_data add column if not exists pot_owner uuid references profiles(id);
alter table events_pot_data add column if not exists pot_closed_at timestamptz;

create or replace function sync_events_public_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from events_public_data where id = old.id;
    delete from events_pot_data where id = old.id;
    return old;
  end if;

  insert into events_public_data (id, short_code, title, theme, locale, status, allow_companions, pot_enabled)
  values (new.id, new.short_code, new.title, new.theme, new.locale, new.status, new.allow_companions, new.pot_enabled)
  on conflict (id) do update set
    short_code = excluded.short_code,
    title = excluded.title,
    theme = excluded.theme,
    locale = excluded.locale,
    status = excluded.status,
    allow_companions = excluded.allow_companions,
    pot_enabled = excluded.pot_enabled;

  insert into events_pot_data (
    id, short_code, title, theme, locale, status,
    pot_enabled, pot_mode, pot_goal_cents, pot_label, pot_owner, pot_closed_at
  )
  values (
    new.id, new.short_code, new.title, new.theme, new.locale, new.status,
    new.pot_enabled, new.pot_mode, new.pot_goal_cents, new.pot_label, new.pot_owner, new.pot_closed_at
  )
  on conflict (id) do update set
    short_code = excluded.short_code,
    title = excluded.title,
    theme = excluded.theme,
    locale = excluded.locale,
    status = excluded.status,
    pot_enabled = excluded.pot_enabled,
    pot_mode = excluded.pot_mode,
    pot_goal_cents = excluded.pot_goal_cents,
    pot_label = excluded.pot_label,
    pot_owner = excluded.pot_owner,
    pot_closed_at = excluded.pot_closed_at;

  return new;
end;
$$;

-- Backfill des lignes déjà synchronisées avant cet ajout de colonnes.
update events_pot_data epd
set pot_owner = e.pot_owner, pot_closed_at = e.pot_closed_at
from events e
where e.id = epd.id;

-- Retour Thomas (même bug) : `pot_contributions_select` n'autorisait la
-- lecture (nécessaire pour afficher "X€ collectés") qu'à un admin ou un
-- participant APPROUVÉ -- jamais à un restricted à qui l'accès cagnotte a
-- été explicitement accordé, alors que c'est exactement ce que
-- `private.has_pot_access` sert à vérifier partout ailleurs.
drop policy "pot_contributions_select" on pot_contributions;
create policy "pot_contributions_select" on pot_contributions
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (private.is_event_approved_participant(event_id) and not private.is_block_hidden_for_me(event_id, 'pot'))
    or private.has_pot_access(event_id)
  );
