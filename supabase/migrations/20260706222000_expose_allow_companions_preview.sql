-- Expose allow_companions dans events_public_data (non sensible : ne fuite
-- rien sur la date/lieu/participants) pour que le formulaire d'identité
-- invité sache si la section "+X accompagnants" doit s'afficher, même avant
-- validation par un admin (brief 1.1).

alter table events_public_data add column allow_companions boolean not null default true;

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

  insert into events_public_data (id, short_code, title, theme, locale, status, allow_companions)
  values (new.id, new.short_code, new.title, new.theme, new.locale, new.status, new.allow_companions)
  on conflict (id) do update set
    short_code = excluded.short_code,
    title = excluded.title,
    theme = excluded.theme,
    locale = excluded.locale,
    status = excluded.status,
    allow_companions = excluded.allow_companions;

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

-- Backfill des lignes déjà synchronisées avant cet ajout de colonne
update events_public_data epd
set allow_companions = e.allow_companions
from events e
where e.id = epd.id;
