-- Expose pot_enabled (juste le booleen, jamais le label/objectif/montant) dans
-- events_public_data (non sensible, meme principe que allow_companions,
-- migration 20260706222000) : necessaire pour que l'ecran "acces restreint"
-- (GuestRestrictedScreen) sache s'il doit proposer "veux-tu quand meme
-- participer a la cagnotte ?" AVANT que l'admin n'ait autorise quoi que ce
-- soit (donc avant tout acces a events_pot_data, qui reste lui totalement
-- verrouille tant que private.has_pot_access() est faux).

alter table events_public_data add column pot_enabled boolean not null default false;

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

  insert into events_pot_data (id, short_code, title, theme, locale, status, pot_enabled, pot_mode, pot_goal_cents, pot_label)
  values (new.id, new.short_code, new.title, new.theme, new.locale, new.status, new.pot_enabled, new.pot_mode, new.pot_goal_cents, new.pot_label)
  on conflict (id) do update set
    short_code = excluded.short_code,
    title = excluded.title,
    theme = excluded.theme,
    locale = excluded.locale,
    status = excluded.status,
    pot_enabled = excluded.pot_enabled,
    pot_mode = excluded.pot_mode,
    pot_goal_cents = excluded.pot_goal_cents,
    pot_label = excluded.pot_label;

  return new;
end;
$$;

-- Backfill des lignes deja synchronisees avant cet ajout de colonne
update events_public_data epd
set pot_enabled = e.pot_enabled
from events e
where e.id = epd.id;
