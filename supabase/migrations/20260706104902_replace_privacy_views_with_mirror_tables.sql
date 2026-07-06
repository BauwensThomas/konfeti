-- Remplace les 3 vues de confidentialite (events_public_preview, events_pot_preview,
-- rsvps_public) par de vraies tables miroir, synchronisees automatiquement par triggers.
--
-- Pourquoi : ces vues etaient marquees "Security Definer View" (ERROR) par le Security Advisor,
-- car elles contournaient volontairement la RLS de la table brute pour montrer une liste
-- "publique" a d'autres personnes que soi-meme. C'etait sur et teste, mais le fix suggere par
-- Supabase (security_invoker=on) aurait casse la fonctionnalite (chacun ne verrait plus que sa
-- propre ligne). Solution propre : une vraie table qui ne contient JAMAIS les colonnes
-- sensibles (telephone, nom complet, sexe...) peut avoir une regle RLS large ("les participants
-- approuves se voient entre eux") sans aucun risque de fuite, puisque la colonne dangereuse
-- n'existe simplement pas dans cette table. Plus de "Security Definer" du tout : RLS classique.
--
-- Contrepartie assumee : ces tables doivent etre tenues a jour par des triggers a chaque
-- modification de la table source. Un peu plus de code, mais plus robuste et 100% conforme
-- aux recommandations de securite de Supabase.

drop view rsvps_public;
drop view events_pot_preview;
drop view events_public_preview;

-- ============================================================
-- events_public_data : titre + theme seulement, avant validation (brief 1.3)
-- ============================================================
create table events_public_data (
  id uuid primary key references events(id) on delete cascade,
  short_code text not null,
  title text not null,
  theme text not null,
  locale text not null,
  status text not null
);

alter table events_public_data enable row level security;

create policy "events_public_data_select" on events_public_data
  for select to anon, authenticated
  using (status = 'active');

grant select on events_public_data to anon, authenticated;

-- ============================================================
-- events_pot_data : + infos cagnotte, pour les participants "restricted" (cagnotte seule)
-- ============================================================
create table events_pot_data (
  id uuid primary key references events(id) on delete cascade,
  short_code text not null,
  title text not null,
  theme text not null,
  locale text not null,
  status text not null,
  pot_enabled boolean not null,
  pot_mode text,
  pot_goal_cents int,
  pot_label text
);

alter table events_pot_data enable row level security;

create policy "events_pot_data_select" on events_pot_data
  for select to authenticated
  using (
    status = 'active'
    and (
      is_event_restricted_participant(id)
      or is_event_approved_participant(id)
      or is_event_admin(id)
    )
  );

grant select on events_pot_data to authenticated;

-- ============================================================
-- Synchronisation events -> events_public_data / events_pot_data
-- ============================================================
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

  insert into events_public_data (id, short_code, title, theme, locale, status)
  values (new.id, new.short_code, new.title, new.theme, new.locale, new.status)
  on conflict (id) do update set
    short_code = excluded.short_code,
    title = excluded.title,
    theme = excluded.theme,
    locale = excluded.locale,
    status = excluded.status;

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

create trigger events_sync_public_data
  after insert or update or delete on events
  for each row execute function sync_events_public_data();

revoke execute on function sync_events_public_data() from public, anon, authenticated;

-- ============================================================
-- rsvps_public_data : liste des participants pour l'onglet Personnes (brief 1.1, 5.5)
-- Seulement les colonnes sans danger : jamais telephone/sexe/nom complet dans cette table.
-- ============================================================
create table rsvps_public_data (
  id uuid primary key references rsvps(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  first_name text,
  last_initial text,
  avatar_kind text,
  avatar_value text,
  status text not null,
  role text not null,
  answer text not null,
  is_designated_driver boolean not null,
  checked_in_at timestamptz,
  companions_count int not null default 0
);

alter table rsvps_public_data enable row level security;

create index rsvps_public_data_event_id_idx on rsvps_public_data(event_id);

create policy "rsvps_public_data_select" on rsvps_public_data
  for select to authenticated
  using (
    status = 'approved'
    and (is_event_admin(event_id) or is_event_approved_participant(event_id))
  );

grant select on rsvps_public_data to authenticated;

-- ============================================================
-- Synchronisation rsvps -> rsvps_public_data
-- ============================================================
create or replace function sync_rsvps_public_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from rsvps_public_data where id = old.id;
    return old;
  end if;

  insert into rsvps_public_data (
    id, event_id, first_name, last_initial, avatar_kind, avatar_value,
    status, role, answer, is_designated_driver, checked_in_at, companions_count
  )
  values (
    new.id, new.event_id, new.first_name, left(new.last_name, 1), new.avatar_kind, new.avatar_value,
    new.status, new.role, new.answer, new.is_designated_driver, new.checked_in_at,
    (select count(*) from companions c where c.rsvp_id = new.id)
  )
  on conflict (id) do update set
    event_id = excluded.event_id,
    first_name = excluded.first_name,
    last_initial = excluded.last_initial,
    avatar_kind = excluded.avatar_kind,
    avatar_value = excluded.avatar_value,
    status = excluded.status,
    role = excluded.role,
    answer = excluded.answer,
    is_designated_driver = excluded.is_designated_driver,
    checked_in_at = excluded.checked_in_at,
    companions_count = excluded.companions_count;

  return new;
end;
$$;

create trigger rsvps_sync_public_data
  after insert or update or delete on rsvps
  for each row execute function sync_rsvps_public_data();

revoke execute on function sync_rsvps_public_data() from public, anon, authenticated;

-- Le nombre d'accompagnants doit aussi se mettre a jour si on ajoute/retire un companion
-- sans toucher a la ligne rsvps elle-meme
create or replace function sync_companions_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rsvp_id uuid;
begin
  v_rsvp_id := coalesce(new.rsvp_id, old.rsvp_id);
  update rsvps_public_data
  set companions_count = (select count(*) from companions where rsvp_id = v_rsvp_id)
  where id = v_rsvp_id;
  return null;
end;
$$;

create trigger companions_sync_count
  after insert or delete on companions
  for each row execute function sync_companions_count();

revoke execute on function sync_companions_count() from public, anon, authenticated;
