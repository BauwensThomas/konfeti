-- ============================================================
-- Konfeti -- schéma complet, généré automatiquement
-- ============================================================
-- Fichier généré par scripts/build-full-schema.mjs, concaténation de toutes
-- les migrations de supabase/migrations/ dans l'ordre chronologique.
-- NE PAS ÉDITER À LA MAIN -- toute modification doit se faire dans les
-- migrations d'origine, puis relancer ce script pour régénérer ce fichier.
--
-- Usage : coller l'intégralité de ce fichier dans le SQL Editor d'un projet
-- Supabase NEUF (base vide) pour reconstruire tout le schéma d'un coup.
-- Généré le 2026-07-17, à partir de 86 migrations.
-- ============================================================

-- ============================================================
-- Migration : 20260706101045_schema_core.sql
-- ============================================================
-- Schema complet Konfeti V1 (brief section 5.2)
-- Postgres 17 (Supabase). gen_random_uuid() est fourni par pgcrypto.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================
-- Comptes (via Supabase Auth)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  first_name text,
  last_name text,                            -- affichage public: premiere lettre seule (voir vue)
  phone text,                                 -- obligatoire en pratique, visible admins seulement
  gender text check (gender in ('female', 'male')),
  avatar_kind text not null default 'preset' check (avatar_kind in ('preset', 'photo')),
  avatar_value text,
  spotify_connected boolean not null default false,
  stripe_account_id text,                     -- compte Connect Express si cagnotte
  created_at timestamptz not null default now()
);

-- ============================================================
-- Evenements
-- ============================================================
create table events (
  id uuid primary key default gen_random_uuid(),
  short_code text unique not null,
  host_id uuid not null references profiles(id),
  title text not null,
  description text,
  theme text not null default 'generic',
  locale text not null default 'fr',
  date_mode text not null default 'fixed' check (date_mode in ('fixed', 'poll')),
  starts_at timestamptz,                      -- NULL tant que date_mode = 'poll'
  ends_at timestamptz,
  location_text text,
  location_lat double precision,
  location_lng double precision,
  -- L'occasion
  occasion text check (occasion in ('birthday', 'housewarming', 'bachelor', 'bbq', 'aperitif', 'new_year', 'other')),
  birthday_person text,
  birthday_date date,
  birthday_age int,
  show_age boolean not null default true,
  -- Consignes
  instructions text,
  dress_code text,
  bring_general text,
  kids_allowed text check (kids_allowed in ('yes', 'no', 'details')),
  pets_allowed text check (pets_allowed in ('yes', 'no', 'details')),
  rsvp_deadline timestamptz,
  -- Options
  max_guests int,
  allow_companions boolean not null default true,
  auto_approve boolean not null default false,
  share_policy text not null default 'all' check (share_policy in ('all', 'admins')),
  -- Cagnotte
  pot_enabled boolean not null default false,
  pot_mode text not null default 'goal' check (pot_mode in ('goal', 'open')),
  pot_goal_cents int,
  pot_label text,
  pot_close_at_goal boolean not null default false,
  pot_owner uuid references profiles(id),
  -- Masquage beneficiaire (la cagnotte est TOUJOURS masquee, non listee ici)
  beneficiary_hidden_blocks text[] not null default '{}',
  spotify_playlist_id text,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);

create index events_host_id_idx on events(host_id);
create index events_pot_owner_idx on events(pot_owner);
create index events_status_idx on events(status);

-- ============================================================
-- Participations
-- ============================================================
create table rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  profile_id uuid references profiles(id),
  first_name text,
  last_name text,                             -- public: premiere lettre seule (voir vue)
  phone text,                                 -- admins seulement
  gender text check (gender in ('female', 'male')),
  avatar_kind text not null default 'preset' check (avatar_kind in ('preset', 'photo')),
  avatar_value text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'restricted', 'removed', 'left')),
  role text not null default 'guest' check (role in ('guest', 'admin', 'beneficiary')),
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  answer text not null check (answer in ('yes', 'maybe', 'no')),
  guest_contact text,
  contact_consent boolean not null default false,
  contact_visible boolean not null default false,
  guest_code text unique,
  is_designated_driver boolean not null default false,
  checked_in_at timestamptz,
  is_anonymized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rsvps_event_id_idx on rsvps(event_id);
create index rsvps_profile_id_idx on rsvps(profile_id);
create index rsvps_event_status_idx on rsvps(event_id, status);
create unique index rsvps_event_profile_unique on rsvps(event_id, profile_id) where profile_id is not null;

-- ============================================================
-- Accompagnants (+X)
-- ============================================================
create table companions (
  id uuid primary key default gen_random_uuid(),
  rsvp_id uuid not null references rsvps(id) on delete cascade,
  kind text not null check (kind in ('partner', 'child', 'friend', 'family')),
  first_name text
);

create index companions_rsvp_id_idx on companions(rsvp_id);

-- ============================================================
-- Chat
-- ============================================================
create table messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  rsvp_id uuid references rsvps(id),
  channel text not null default 'main' check (channel in ('main', 'backstage')),
  body text,
  photo_url text,
  reply_to uuid references messages(id),
  is_system boolean not null default false,
  deleted_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_event_channel_idx on messages(event_id, channel, created_at);
create index messages_rsvp_id_idx on messages(rsvp_id);

create table message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  rsvp_id uuid not null references rsvps(id) on delete cascade,
  sticker_id text not null,
  primary key (message_id, rsvp_id, sticker_id)
);

-- Suivi de lecture (pastille rouge des non-lus)
create table chat_reads (
  event_id uuid not null references events(id) on delete cascade,
  rsvp_id uuid not null references rsvps(id) on delete cascade,
  channel text not null default 'main' check (channel in ('main', 'backstage')),
  last_read_at timestamptz not null default now(),
  primary key (event_id, rsvp_id, channel)
);
-- non-lus = count(messages ou created_at > last_read_at)

-- ============================================================
-- Sondage de date (Doodle integre)
-- ============================================================
create table date_options (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  starts_at timestamptz not null,
  label text
);

create index date_options_event_id_idx on date_options(event_id);

create table date_votes (
  option_id uuid not null references date_options(id) on delete cascade,
  rsvp_id uuid not null references rsvps(id) on delete cascade,
  primary key (option_id, rsvp_id)
);
-- Quand l'organisateur fige une date : events.starts_at = option choisie,
-- date_mode = 'fixed', notification a tous, calage des rappels

-- ============================================================
-- Sondages
-- ============================================================
create table polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  question text not null
);

create index polls_event_id_idx on polls(event_id);

create table poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  label text not null
);

create index poll_options_poll_id_idx on poll_options(poll_id);

create table poll_votes (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references poll_options(id) on delete cascade,
  rsvp_id uuid not null references rsvps(id) on delete cascade,
  unique(option_id, rsvp_id)
);

create index poll_votes_rsvp_id_idx on poll_votes(rsvp_id);

-- ============================================================
-- Qui amene quoi (depassement autorise, suivi jour J)
-- ============================================================
create table bring_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text not null,
  quantity_needed int not null default 1
);

create index bring_items_event_id_idx on bring_items(event_id);

create table bring_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references bring_items(id) on delete cascade,
  rsvp_id uuid not null references rsvps(id) on delete cascade,
  quantity int not null default 1,
  brought boolean not null default false,
  unique(item_id, rsvp_id)
);

create index bring_claims_rsvp_id_idx on bring_claims(rsvp_id);

-- ============================================================
-- Cagnotte
-- ============================================================
create table pot_contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  rsvp_id uuid references rsvps(id),
  amount_cents int not null check (amount_cents > 0),
  fee_stripe_cents int,
  fee_konfeti_cents int,
  net_cents int,
  currency text not null default 'eur',
  stripe_payment_intent text,
  status text not null default 'pending' check (status in ('pending', 'succeeded')),
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create index pot_contributions_event_id_idx on pot_contributions(event_id);
create index pot_contributions_rsvp_id_idx on pot_contributions(rsvp_id);

-- Suivi des versements Stripe vers l'organisateur (sync via webhooks payout)
create table pot_payouts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  stripe_payout_id text unique,
  amount_cents int not null,
  status text not null check (status in ('pending', 'paid', 'failed')),
  arrival_date date,
  created_at timestamptz not null default now()
);

create index pot_payouts_event_id_idx on pot_payouts(event_id);

-- ============================================================
-- Playlist
-- ============================================================
create table playlist_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  rsvp_id uuid references rsvps(id),
  spotify_track_id text not null,
  track_name text not null,
  artist_name text not null,
  added_to_playlist boolean not null default false,
  created_at timestamptz not null default now(),
  unique(event_id, spotify_track_id)
);

create index playlist_suggestions_rsvp_id_idx on playlist_suggestions(rsvp_id);

-- ============================================================
-- Recos locales (cache Google Places)
-- ============================================================
create table places_cache (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category text not null,
  results jsonb not null,
  fetched_at timestamptz not null default now(),
  unique(event_id, category)
);

-- ============================================================
-- Rappels programmes
-- ============================================================
create table scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  kind text not null,
  send_at timestamptz not null,
  sent boolean not null default false
);

create index scheduled_messages_pending_idx on scheduled_messages(send_at) where sent = false;

-- ============================================================
-- Waitlist pre-lancement
-- ============================================================
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now(),
  notified boolean not null default false
);

-- ============================================================
-- Feature flags (pilotes depuis /admin, lus cote serveur)
-- ============================================================
create table feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into feature_flags (key, enabled) values
  ('pot', false),
  ('spotify', false),
  ('recos', false),
  ('chat_photos', false),
  ('demo', false);

-- ============================================================
-- Migration : 20260706101046_rls_helpers.sql
-- ============================================================
-- Fonctions utilitaires pour les policies RLS.
-- security definer + search_path fixe : evite la recursion RLS et le detournement de search_path
-- (voir checklist securite Supabase).

create or replace function is_event_host(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from events
    where id = p_event_id
      and host_id = auth.uid()
  );
$$;

create or replace function my_rsvp_status(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from rsvps
  where event_id = p_event_id
    and profile_id = auth.uid()
  limit 1;
$$;

create or replace function my_rsvp_role(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from rsvps
  where event_id = p_event_id
    and profile_id = auth.uid()
    and status = 'approved'
  limit 1;
$$;

create or replace function is_event_admin(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_event_host(p_event_id) or my_rsvp_role(p_event_id) = 'admin';
$$;

create or replace function is_event_approved_participant(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select my_rsvp_status(p_event_id) = 'approved' or is_event_host(p_event_id);
$$;

create or replace function is_event_restricted_participant(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select my_rsvp_status(p_event_id) = 'restricted';
$$;

create or replace function is_event_beneficiary(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select my_rsvp_role(p_event_id) = 'beneficiary';
$$;

-- true si le bloc doit etre cache pour l'appelant (il est le beneficiaire ET ce bloc est dans sa liste de blocs caches)
create or replace function is_block_hidden_for_me(p_event_id uuid, p_block text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_event_beneficiary(p_event_id)
    and exists (
      select 1 from events
      where id = p_event_id
        and p_block = any(beneficiary_hidden_blocks)
    );
$$;

-- proprietaire d'une ligne rsvp (pour les policies d'ecriture "un participant ne modifie que SES lignes")
create or replace function is_my_rsvp(p_rsvp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from rsvps
    where id = p_rsvp_id
      and profile_id = auth.uid()
  );
$$;

-- ============================================================
-- Migration : 20260706101047_rls_policies.sql
-- ============================================================
-- RLS : activee sur TOUTES les tables, tout est refuse par defaut, chaque acces est explicite (brief 5.5).
--
-- Identite : chaque participant (compte reel email/Google OU invite "code d'acces") passe par
-- Supabase Auth et a donc un auth.uid() -- les invites "code" utilisent l'auth anonyme Supabase
-- (signInAnonymously), le "code d'acces" servant uniquement de mecanisme de recuperation
-- cross-device (voir doc/ARCHITECTURE.md et doc/DECISIONS.md pour le detail de ce choix).
--
-- Colonnes sensibles (last_name complet, phone, gender, contenu cagnotte...) : jamais de grant
-- direct au client sur les colonnes de decision (status, role, approbation...), qui ne changent
-- que via des fonctions security definer ou le service_role (webhooks Stripe, back-office).

-- ============================================================
-- profiles
-- ============================================================
alter table profiles enable row level security;

revoke all on profiles from anon, authenticated;
grant select on profiles to authenticated;
grant insert (id, first_name, last_name, phone, gender, avatar_kind, avatar_value) on profiles to authenticated;
grant update (first_name, last_name, phone, gender, avatar_kind, avatar_value) on profiles to authenticated;

create policy "profiles_select_own" on profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own" on profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- events
-- ============================================================
alter table events enable row level security;

create policy "events_select_full_for_participants" on events
  for select to authenticated
  using (
    is_event_admin(id)
    or is_event_approved_participant(id)
  );

create policy "events_insert_as_host" on events
  for insert to authenticated
  with check (host_id = auth.uid());

create policy "events_update_by_admin" on events
  for update to authenticated
  using (is_event_admin(id))
  with check (is_event_admin(id));

-- Pas de policy delete : aucune suppression physique depuis l'interface (brief 5.5),
-- l'annulation se fait via status = 'cancelled' (deja couvert par la policy update ci-dessus).

-- ============================================================
-- rsvps
-- ============================================================
alter table rsvps enable row level security;

revoke all on rsvps from anon, authenticated;
grant select on rsvps to authenticated;
grant insert (
  event_id, profile_id, first_name, last_name, phone, gender, avatar_kind, avatar_value,
  answer, guest_contact, contact_consent, contact_visible, is_designated_driver
) on rsvps to authenticated;
grant update (
  first_name, last_name, phone, gender, avatar_kind, avatar_value, answer,
  guest_contact, contact_consent, contact_visible, is_designated_driver, checked_in_at
) on rsvps to authenticated;

-- Un participant voit sa propre ligne complete ; les admins/host voient toutes les lignes de leur evenement
create policy "rsvps_select_own_or_admin" on rsvps
  for select to authenticated
  using (
    profile_id = auth.uid()
    or is_event_admin(event_id)
  );

-- Un utilisateur ne cree une participation que pour lui-meme
create policy "rsvps_insert_self" on rsvps
  for insert to authenticated
  with check (profile_id = auth.uid());

-- Un participant ne modifie que SA ligne (colonnes limitees par les grants ci-dessus :
-- status/role/approbation/guest_code restent hors de portee du client, reserves aux fonctions
-- security definer ou au service_role -- a construire en Phase 4 pour la validation/les roles)
create policy "rsvps_update_own" on rsvps
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================
-- companions
-- ============================================================
alter table companions enable row level security;

create policy "companions_select" on companions
  for select to authenticated
  using (
    is_my_rsvp(rsvp_id)
    or is_event_admin((select event_id from rsvps where id = rsvp_id))
  );

create policy "companions_write_own" on companions
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (is_my_rsvp(rsvp_id));

-- ============================================================
-- messages
-- ============================================================
alter table messages enable row level security;

revoke all on messages from anon, authenticated;
grant select on messages to authenticated;
grant insert (event_id, rsvp_id, channel, body, photo_url, reply_to) on messages to authenticated;
grant update (deleted_by_admin) on messages to authenticated;
grant delete on messages to authenticated;

create policy "messages_select" on messages
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (
      is_event_approved_participant(event_id)
      and (channel = 'main' or not is_event_beneficiary(event_id))
    )
  );

create policy "messages_insert_own" on messages
  for insert to authenticated
  with check (
    is_event_approved_participant(event_id)
    and is_my_rsvp(rsvp_id)
    and (channel = 'main' or not is_event_beneficiary(event_id))
  );

-- Moderation admin (suppression de n'importe quel message via deleted_by_admin)
create policy "messages_moderate_admin" on messages
  for update to authenticated
  using (is_event_admin(event_id))
  with check (is_event_admin(event_id));

-- Suppression de ses propres messages
create policy "messages_delete_own" on messages
  for delete to authenticated
  using (is_my_rsvp(rsvp_id) and not is_system);

-- ============================================================
-- message_reactions
-- ============================================================
alter table message_reactions enable row level security;

create policy "message_reactions_select" on message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and (is_event_admin(m.event_id) or is_event_approved_participant(m.event_id))
    )
  );

create policy "message_reactions_write_own" on message_reactions
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (is_my_rsvp(rsvp_id));

-- ============================================================
-- chat_reads
-- ============================================================
alter table chat_reads enable row level security;

create policy "chat_reads_own" on chat_reads
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (is_my_rsvp(rsvp_id));

-- ============================================================
-- date_options / date_votes
-- ============================================================
alter table date_options enable row level security;

create policy "date_options_select" on date_options
  for select to authenticated
  using (is_event_admin(event_id) or is_event_approved_participant(event_id));

create policy "date_options_write_admin" on date_options
  for all to authenticated
  using (is_event_admin(event_id))
  with check (is_event_admin(event_id));

alter table date_votes enable row level security;

create policy "date_votes_select" on date_votes
  for select to authenticated
  using (
    exists (
      select 1 from date_options d
      where d.id = option_id
        and (is_event_admin(d.event_id) or is_event_approved_participant(d.event_id))
    )
  );

create policy "date_votes_write_own" on date_votes
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (
    is_my_rsvp(rsvp_id)
    and exists (
      select 1 from date_options d
      where d.id = option_id and is_event_approved_participant(d.event_id)
    )
  );

-- ============================================================
-- polls / poll_options / poll_votes
-- ============================================================
alter table polls enable row level security;

create policy "polls_select" on polls
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (is_event_approved_participant(event_id) and not is_block_hidden_for_me(event_id, 'polls'))
  );

create policy "polls_write_admin" on polls
  for all to authenticated
  using (is_event_admin(event_id))
  with check (is_event_admin(event_id));

alter table poll_options enable row level security;

create policy "poll_options_select" on poll_options
  for select to authenticated
  using (
    exists (
      select 1 from polls p
      where p.id = poll_id
        and (
          is_event_admin(p.event_id)
          or (is_event_approved_participant(p.event_id) and not is_block_hidden_for_me(p.event_id, 'polls'))
        )
    )
  );

create policy "poll_options_write_admin" on poll_options
  for all to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and is_event_admin(p.event_id)))
  with check (exists (select 1 from polls p where p.id = poll_id and is_event_admin(p.event_id)));

alter table poll_votes enable row level security;

create policy "poll_votes_select" on poll_votes
  for select to authenticated
  using (
    exists (
      select 1 from poll_options po join polls p on p.id = po.poll_id
      where po.id = option_id
        and (is_event_admin(p.event_id) or is_event_approved_participant(p.event_id))
    )
  );

create policy "poll_votes_write_own" on poll_votes
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (
    is_my_rsvp(rsvp_id)
    and exists (
      select 1 from poll_options po join polls p on p.id = po.poll_id
      where po.id = option_id
        and is_event_approved_participant(p.event_id)
        and not is_block_hidden_for_me(p.event_id, 'polls')
    )
  );

-- ============================================================
-- bring_items / bring_claims
-- ============================================================
alter table bring_items enable row level security;

create policy "bring_items_select" on bring_items
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (is_event_approved_participant(event_id) and not is_block_hidden_for_me(event_id, 'bring'))
  );

create policy "bring_items_write_admin" on bring_items
  for all to authenticated
  using (is_event_admin(event_id))
  with check (is_event_admin(event_id));

alter table bring_claims enable row level security;

revoke all on bring_claims from anon, authenticated;
grant select on bring_claims to authenticated;
grant insert (item_id, rsvp_id, quantity) on bring_claims to authenticated;
grant update (quantity) on bring_claims to authenticated;
grant update (brought) on bring_claims to authenticated;
grant delete on bring_claims to authenticated;

create policy "bring_claims_select" on bring_claims
  for select to authenticated
  using (
    exists (
      select 1 from bring_items bi
      where bi.id = item_id
        and (
          is_event_admin(bi.event_id)
          or (is_event_approved_participant(bi.event_id) and not is_block_hidden_for_me(bi.event_id, 'bring'))
        )
    )
  );

create policy "bring_claims_write_own" on bring_claims
  for insert to authenticated
  with check (
    is_my_rsvp(rsvp_id)
    and exists (
      select 1 from bring_items bi
      where bi.id = item_id
        and is_event_approved_participant(bi.event_id)
        and not is_block_hidden_for_me(bi.event_id, 'bring')
    )
  );

create policy "bring_claims_update_own" on bring_claims
  for update to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (is_my_rsvp(rsvp_id));

create policy "bring_claims_delete_own" on bring_claims
  for delete to authenticated
  using (is_my_rsvp(rsvp_id));

-- Suivi jour J : un admin coche "apporte" sur n'importe quelle ligne de son evenement
create policy "bring_claims_admin_checkin" on bring_claims
  for update to authenticated
  using (exists (select 1 from bring_items bi where bi.id = item_id and is_event_admin(bi.event_id)))
  with check (exists (select 1 from bring_items bi where bi.id = item_id and is_event_admin(bi.event_id)));

-- ============================================================
-- pot_contributions / pot_payouts
-- La cagnotte est TOUJOURS masquee au beneficiaire (non desactivable, brief 1.4).
-- Les ecritures (montants, frais, statut Stripe) passent uniquement par le webhook Stripe
-- (service_role, Phase 7) : aucun grant insert/update cote client ici.
-- ============================================================
alter table pot_contributions enable row level security;

revoke all on pot_contributions from anon, authenticated;
grant select on pot_contributions to authenticated;

create policy "pot_contributions_select" on pot_contributions
  for select to authenticated
  using (
    (is_event_admin(event_id) and not is_event_beneficiary(event_id))
    or (is_my_rsvp(rsvp_id) and not is_event_beneficiary(event_id))
  );

alter table pot_payouts enable row level security;

revoke all on pot_payouts from anon, authenticated;
grant select on pot_payouts to authenticated;

create policy "pot_payouts_select_admin" on pot_payouts
  for select to authenticated
  using (is_event_admin(event_id) and not is_event_beneficiary(event_id));

-- ============================================================
-- playlist_suggestions
-- ============================================================
alter table playlist_suggestions enable row level security;

revoke all on playlist_suggestions from anon, authenticated;
grant select on playlist_suggestions to authenticated;
grant insert (event_id, rsvp_id, spotify_track_id, track_name, artist_name) on playlist_suggestions to authenticated;
grant delete on playlist_suggestions to authenticated;

create policy "playlist_select" on playlist_suggestions
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (is_event_approved_participant(event_id) and not is_block_hidden_for_me(event_id, 'playlist'))
  );

create policy "playlist_insert_own" on playlist_suggestions
  for insert to authenticated
  with check (
    is_my_rsvp(rsvp_id)
    and is_event_approved_participant(event_id)
    and not is_block_hidden_for_me(event_id, 'playlist')
  );

create policy "playlist_delete_own_or_admin" on playlist_suggestions
  for delete to authenticated
  using (is_my_rsvp(rsvp_id) or is_event_admin(event_id));

-- ============================================================
-- places_cache (cache serveur, lecture seule cote client)
-- ============================================================
alter table places_cache enable row level security;

revoke all on places_cache from anon, authenticated;
grant select on places_cache to authenticated;

create policy "places_cache_select" on places_cache
  for select to authenticated
  using (is_event_admin(event_id) or is_event_approved_participant(event_id));

-- ============================================================
-- scheduled_messages (purement interne, cron/service_role uniquement)
-- ============================================================
alter table scheduled_messages enable row level security;

revoke all on scheduled_messages from anon, authenticated;
-- Aucun grant : ni select, ni ecriture cote client. Gere entierement par le service_role (cron Vercel).

-- ============================================================
-- waitlist (inscription publique avant lancement)
-- ============================================================
alter table waitlist enable row level security;

revoke all on waitlist from anon, authenticated;
grant insert (email) on waitlist to anon, authenticated;

create policy "waitlist_insert_public" on waitlist
  for insert to anon, authenticated
  with check (true);

-- Pas de select cote client : le compteur d'inscrits et la liste sont lus par le back-office
-- via le service_role (session admin dediee, voir brief 5.8), pas par une policy RLS.

-- ============================================================
-- feature_flags (lus cote serveur pour activer/desactiver des modules)
-- ============================================================
alter table feature_flags enable row level security;

revoke all on feature_flags from anon, authenticated;
grant select on feature_flags to anon, authenticated;

create policy "feature_flags_select_public" on feature_flags
  for select to anon, authenticated
  using (true);

-- Ecriture reservee au back-office (service_role), pas de policy insert/update/delete ici.

-- ============================================================
-- Migration : 20260706101048_privacy_views.sql
-- ============================================================
-- Vues de confidentialite (brief 5.5).
--
-- Ces vues n'utilisent PAS security_invoker : elles s'appuient sur les fonctions security definer
-- (is_event_admin, is_event_approved_participant...) pour leur propre controle d'acces, et
-- redigent volontairement les colonnes sensibles (jamais selectionnees ici, donc jamais exposees,
-- quelle que soit la policy RLS de la table de base). C'est le pattern recommande par Supabase pour
-- exposer une liste "publique" (participants, aperçu d'evenement) au-dela de ce qu'autorise la RLS
-- ligne par ligne sur la table brute.

-- ============================================================
-- events_public_preview : titre + theme seulement, avant validation (brief 1.3)
-- ============================================================
create view events_public_preview as
select
  id,
  short_code,
  title,
  theme,
  locale
from events
where status = 'active';

grant select on events_public_preview to anon, authenticated;

-- ============================================================
-- events_pot_preview : + infos cagnotte, pour les participants "restricted" (cagnotte seule)
-- ============================================================
create view events_pot_preview as
select
  id,
  short_code,
  title,
  theme,
  locale,
  pot_enabled,
  pot_mode,
  pot_goal_cents,
  pot_label
from events
where status = 'active'
  and (
    is_event_restricted_participant(id)
    or is_event_approved_participant(id)
    or is_event_admin(id)
  );

grant select on events_pot_preview to authenticated;

-- ============================================================
-- rsvps_public : liste des participants pour l'onglet Personnes, nom tronque a l'initiale,
-- jamais de telephone ni de sexe (brief 1.1, 5.5)
-- ============================================================
create view rsvps_public as
select
  id,
  event_id,
  first_name,
  left(last_name, 1) as last_initial,
  avatar_kind,
  avatar_value,
  status,
  role,
  answer,
  is_designated_driver,
  checked_in_at,
  (select count(*) from companions c where c.rsvp_id = rsvps.id) as companions_count
from rsvps
where is_event_admin(event_id) or is_event_approved_participant(event_id);

grant select on rsvps_public to authenticated;

-- ============================================================
-- Migration : 20260706101049_participant_lifecycle.sql
-- ============================================================
-- Depart / suppression d'un participant (brief 1.5 et procedure 5.2).
-- security definer : doit pouvoir ecrire des colonnes hors de portee des grants clients
-- (status, guest_code, profile_id...), donc s'execute avec les privileges du proprietaire
-- de la fonction, apres avoir verifie lui-meme l'autorisation de l'appelant.

create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id into v_event_id from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  -- 1. Nettoyage des engagements (les jauges/ratios se recalculent automatiquement,
  --    puisqu'ils sont derives par comptage des lignes restantes)
  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  -- 2. Anonymisation de l'identite (les messages et pot_contributions restent, "Anonyme"
  --    via la jointure -- voir rsvps_public qui affichera first_name = null)
  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    guest_code = null,
    profile_id = null,
    updated_at = now()
  where id = p_rsvp_id;

  -- 3. La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

grant execute on function leave_or_remove_participant(uuid, text) to authenticated;

-- ============================================================
-- Migration : 20260706101050_auth_triggers.sql
-- ============================================================
-- Cree automatiquement une ligne profiles a la creation d'un compte Supabase Auth
-- (email/Google reel OU session anonyme pour les invites "code d'acces", voir doc/ARCHITECTURE.md).
-- Le prenom est complete a partir des metadonnees Google si disponibles ; le reste
-- (telephone, sexe) est rempli ensuite par l'app (brief : "completion du profil").

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Touche updated_at automatiquement sur rsvps a chaque modification
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rsvps_touch_updated_at
  before update on rsvps
  for each row execute function touch_updated_at();

-- ============================================================
-- Migration : 20260706102447_fix_rsvps_public_view.sql
-- ============================================================
-- Correction : rsvps_public montrait aussi les participants "pending" et "restricted" a
-- n'importe quel autre participant approuve. Seuls les participants "approved" doivent
-- apparaitre dans l'onglet Personnes cote invite (la file d'attente reste reservee aux
-- admins, qui consultent la table brute rsvps directement).

create or replace view rsvps_public as
select
  id,
  event_id,
  first_name,
  left(last_name, 1) as last_initial,
  avatar_kind,
  avatar_value,
  status,
  role,
  answer,
  is_designated_driver,
  checked_in_at,
  (select count(*) from companions c where c.rsvp_id = rsvps.id) as companions_count
from rsvps
where status = 'approved'
  and (is_event_admin(event_id) or is_event_approved_participant(event_id));

-- ============================================================
-- Migration : 20260706103223_security_advisor_fixes.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260706103734_revoke_anon_function_access.sql
-- ============================================================
-- Le reset du schema public (voir DECISIONS.md, incident timestamps de migration) a recree les
-- privileges par defaut de Supabase, qui accordent EXECUTE sur toutes les fonctions a anon et
-- authenticated. Ce n'est pas ce qu'on veut : on retire tout, puis on ne redonne que le strict
-- necessaire.

-- Fonctions utilitaires RLS : utilisees UNIQUEMENT a l'interieur des policies, evaluees en tant
-- que "authenticated" (jamais par un visiteur anonyme, qui ne passe jamais ces checks de toute
-- facon). Executees automatiquement par le moteur RLS, mais un appel RPC direct par un role qui
-- n'en a pas besoin ne doit pas etre possible.
revoke execute on function is_event_host(uuid) from public, anon, authenticated;
revoke execute on function my_rsvp_status(uuid) from public, anon, authenticated;
revoke execute on function my_rsvp_role(uuid) from public, anon, authenticated;
revoke execute on function is_event_admin(uuid) from public, anon, authenticated;
revoke execute on function is_event_approved_participant(uuid) from public, anon, authenticated;
revoke execute on function is_event_restricted_participant(uuid) from public, anon, authenticated;
revoke execute on function is_event_beneficiary(uuid) from public, anon, authenticated;
revoke execute on function is_block_hidden_for_me(uuid, text) from public, anon, authenticated;
revoke execute on function is_my_rsvp(uuid) from public, anon, authenticated;

-- Necessaire pour que les policies RLS evaluees en tant que "authenticated" fonctionnent
-- (le reste de la RLS -- events, rsvps, messages... -- s'appuie dessus). "anon" n'en a jamais
-- besoin puisqu'il n'a acces a aucune des tables/vues qui les utilisent.
grant execute on function is_event_host(uuid) to authenticated;
grant execute on function my_rsvp_status(uuid) to authenticated;
grant execute on function my_rsvp_role(uuid) to authenticated;
grant execute on function is_event_admin(uuid) to authenticated;
grant execute on function is_event_approved_participant(uuid) to authenticated;
grant execute on function is_event_restricted_participant(uuid) to authenticated;
grant execute on function is_event_beneficiary(uuid) to authenticated;
grant execute on function is_block_hidden_for_me(uuid, text) to authenticated;
grant execute on function is_my_rsvp(uuid) to authenticated;

-- leave_or_remove_participant : seuls les utilisateurs connectes (compte reel ou anonyme Supabase,
-- voir doc/ARCHITECTURE.md) peuvent l'appeler, jamais un visiteur anonyme sans session
revoke execute on function leave_or_remove_participant(uuid, text) from public, anon;
grant execute on function leave_or_remove_participant(uuid, text) to authenticated;

-- handle_new_auth_user / touch_updated_at : fonctions de trigger uniquement, jamais appelees
-- directement par un client. Le trigger continue de fonctionner sans EXECUTE (il n'est pas soumis
-- a ce privilege), seul l'appel RPC direct est desormais bloque.
revoke execute on function handle_new_auth_user() from public, anon, authenticated;
revoke execute on function touch_updated_at() from public, anon, authenticated;

-- ============================================================
-- Migration : 20260706104225_performance_advisor_fixes.sql
-- ============================================================
-- Corrections suite au Performance Advisor de Supabase.

-- 1. Colonnes de cle etrangere sans index (ralentit les jointures/suppressions en cascade)
create index rsvps_approved_by_idx on rsvps(approved_by);
create index messages_reply_to_idx on messages(reply_to);
create index scheduled_messages_event_id_idx on scheduled_messages(event_id);

-- 2. bring_claims avait 2 policies UPDATE permissives pour "authenticated" (une pour le
-- participant sur sa propre ligne, une pour l'admin qui coche "apporte"), evaluees en double
-- a chaque requete. Fusionnees en une seule policy (le resultat d'autorisation est identique :
-- Postgres combine de toute facon plusieurs policies permissives du meme type avec un OR ;
-- la distinction "le participant ne peut modifier que quantity, l'admin que brought" reste
-- entierement geree par les grants de colonnes existants, inchanges).
drop policy "bring_claims_update_own" on bring_claims;
drop policy "bring_claims_admin_checkin" on bring_claims;

create policy "bring_claims_update" on bring_claims
  for update to authenticated
  using (
    is_my_rsvp(rsvp_id)
    or exists (select 1 from bring_items bi where bi.id = item_id and is_event_admin(bi.event_id))
  )
  with check (
    is_my_rsvp(rsvp_id)
    or exists (select 1 from bring_items bi where bi.id = item_id and is_event_admin(bi.event_id))
  );

-- ============================================================
-- Migration : 20260706104902_replace_privacy_views_with_mirror_tables.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260706105349_move_rls_helpers_to_private_schema.sql
-- ============================================================
-- Les fonctions utilitaires RLS ne servent qu'a l'interieur des policies (jamais appelees
-- directement par l'app). Le Security Advisor les signale comme "executable par authenticated
-- via /rest/v1/rpc/..." -- vrai, puisque PostgREST expose automatiquement tout ce qui est dans
-- le schema `public`. La remediation officielle de Supabase pour ce cas est de sortir la fonction
-- du schema expose par l'API : PostgREST n'en fera alors plus un endpoint RPC, mais Postgres peut
-- toujours l'appeler nativement lors de l'evaluation d'une policy RLS (ce n'est pas la meme
-- mecanique). leave_or_remove_participant reste dans public : elle, on veut qu'elle soit
-- appelable directement (bouton "Quitter le groupe" / suppression admin).
--
-- Deplacer le schema d'une fonction ne casse pas les policies existantes : Postgres les a deja
-- resolues vers l'OID de la fonction a leur creation, independant du schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter function is_event_host(uuid) set schema private;
alter function my_rsvp_status(uuid) set schema private;
alter function my_rsvp_role(uuid) set schema private;
alter function is_event_admin(uuid) set schema private;
alter function is_event_approved_participant(uuid) set schema private;
alter function is_event_restricted_participant(uuid) set schema private;
alter function is_event_beneficiary(uuid) set schema private;
alter function is_block_hidden_for_me(uuid, text) set schema private;
alter function is_my_rsvp(uuid) set schema private;

-- Convention a suivre pour toute nouvelle fonction utilitaire RLS future : la creer directement
-- dans le schema `private`, et la referencer avec le prefixe (`private.is_event_admin(...)`)
-- dans les nouvelles policies.

-- ============================================================
-- Migration : 20260706105452_fix_private_schema_search_path.sql
-- ============================================================
-- Correction : deplacer ces fonctions vers le schema "private" ne suffisait pas, elles
-- s'appellent entre elles en interne (is_event_admin appelle is_event_host et my_rsvp_role,
-- is_block_hidden_for_me appelle is_event_beneficiary...) et leur search_path fixe ne
-- pointait que vers "public", donc elles ne se retrouvaient plus elles-memes une fois deplacees.
-- On ajoute "private" a leur search_path (en plus de "public", toujours necessaire pour
-- trouver rsvps/events/companions).

alter function private.is_event_host(uuid) set search_path = private, public;
alter function private.my_rsvp_status(uuid) set search_path = private, public;
alter function private.my_rsvp_role(uuid) set search_path = private, public;
alter function private.is_event_admin(uuid) set search_path = private, public;
alter function private.is_event_approved_participant(uuid) set search_path = private, public;
alter function private.is_event_restricted_participant(uuid) set search_path = private, public;
alter function private.is_event_beneficiary(uuid) set search_path = private, public;
alter function private.is_block_hidden_for_me(uuid, text) set search_path = private, public;
alter function private.is_my_rsvp(uuid) set search_path = private, public;

-- ============================================================
-- Migration : 20260706110035_performance_advisor_fixes_2.sql
-- ============================================================
-- Suite du Performance Advisor.

-- ============================================================
-- 1. auth_rls_initplan : auth.uid() appele directement dans une policy est reevalue a
-- chaque ligne. En l'enveloppant dans (select auth.uid()), Postgres l'evalue une seule fois
-- par requete (initplan). Comportement identique, juste plus rapide a grande echelle.
-- ============================================================
alter policy "profiles_select_own" on profiles
  using (id = (select auth.uid()));

alter policy "profiles_insert_own" on profiles
  with check (id = (select auth.uid()));

alter policy "profiles_update_own" on profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "events_insert_as_host" on events
  with check (host_id = (select auth.uid()));

alter policy "rsvps_select_own_or_admin" on rsvps
  using (profile_id = (select auth.uid()) or private.is_event_admin(event_id));

alter policy "rsvps_insert_self" on rsvps
  with check (profile_id = (select auth.uid()));

alter policy "rsvps_update_own" on rsvps
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Meme optimisation a l'interieur des fonctions utilitaires qui appellent auth.uid()
-- directement (le linter ne voit pas l'interieur des fonctions, mais le principe est identique)
create or replace function private.is_event_host(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from events
    where id = p_event_id
      and host_id = (select auth.uid())
  );
$$;

create or replace function private.my_rsvp_status(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = private, public
as $$
  select status from rsvps
  where event_id = p_event_id
    and profile_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.my_rsvp_role(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = private, public
as $$
  select role from rsvps
  where event_id = p_event_id
    and profile_id = (select auth.uid())
    and status = 'approved'
  limit 1;
$$;

create or replace function private.is_my_rsvp(p_rsvp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from rsvps
    where id = p_rsvp_id
      and profile_id = (select auth.uid())
  );
$$;

-- ============================================================
-- 2. multiple_permissive_policies : ces 8 tables avaient une policy "_select" dediee ET une
-- policy "for all" (qui couvre donc AUSSI select) pour le meme role authenticated -> les deux
-- sont evaluees a chaque lecture. On restreint les policies "for all" a insert/update/delete
-- uniquement : le select est deja entierement couvert par la policy "_select" existante,
-- comportement d'autorisation inchange.
-- ============================================================
drop policy "companions_write_own" on companions;
create policy "companions_write_own" on companions
  for insert
  to authenticated
  with check (private.is_my_rsvp(rsvp_id));
create policy "companions_update_own" on companions
  for update to authenticated
  using (private.is_my_rsvp(rsvp_id))
  with check (private.is_my_rsvp(rsvp_id));
create policy "companions_delete_own" on companions
  for delete to authenticated
  using (private.is_my_rsvp(rsvp_id));

drop policy "date_options_write_admin" on date_options;
create policy "date_options_write_admin" on date_options
  for insert to authenticated
  with check (private.is_event_admin(event_id));
create policy "date_options_update_admin" on date_options
  for update to authenticated
  using (private.is_event_admin(event_id))
  with check (private.is_event_admin(event_id));
create policy "date_options_delete_admin" on date_options
  for delete to authenticated
  using (private.is_event_admin(event_id));

drop policy "date_votes_write_own" on date_votes;
create policy "date_votes_write_own" on date_votes
  for insert to authenticated
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (select 1 from date_options d where d.id = option_id and private.is_event_approved_participant(d.event_id))
  );
create policy "date_votes_delete_own" on date_votes
  for delete to authenticated
  using (private.is_my_rsvp(rsvp_id));

drop policy "polls_write_admin" on polls;
create policy "polls_write_admin" on polls
  for insert to authenticated
  with check (private.is_event_admin(event_id));
create policy "polls_update_admin" on polls
  for update to authenticated
  using (private.is_event_admin(event_id))
  with check (private.is_event_admin(event_id));
create policy "polls_delete_admin" on polls
  for delete to authenticated
  using (private.is_event_admin(event_id));

drop policy "poll_options_write_admin" on poll_options;
create policy "poll_options_write_admin" on poll_options
  for insert to authenticated
  with check (exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id)));
create policy "poll_options_update_admin" on poll_options
  for update to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id)))
  with check (exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id)));
create policy "poll_options_delete_admin" on poll_options
  for delete to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id)));

drop policy "poll_votes_write_own" on poll_votes;
create policy "poll_votes_write_own" on poll_votes
  for insert to authenticated
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from poll_options po join polls p on p.id = po.poll_id
      where po.id = option_id
        and private.is_event_approved_participant(p.event_id)
        and not private.is_block_hidden_for_me(p.event_id, 'polls')
    )
  );
create policy "poll_votes_delete_own" on poll_votes
  for delete to authenticated
  using (private.is_my_rsvp(rsvp_id));

drop policy "bring_items_write_admin" on bring_items;
create policy "bring_items_write_admin" on bring_items
  for insert to authenticated
  with check (private.is_event_admin(event_id));
create policy "bring_items_update_admin" on bring_items
  for update to authenticated
  using (private.is_event_admin(event_id))
  with check (private.is_event_admin(event_id));
create policy "bring_items_delete_admin" on bring_items
  for delete to authenticated
  using (private.is_event_admin(event_id));

drop policy "message_reactions_write_own" on message_reactions;
create policy "message_reactions_write_own" on message_reactions
  for insert to authenticated
  with check (private.is_my_rsvp(rsvp_id));
create policy "message_reactions_delete_own" on message_reactions
  for delete to authenticated
  using (private.is_my_rsvp(rsvp_id));

-- ============================================================
-- Migration : 20260706110337_performance_advisor_fixes_3.sql
-- ============================================================
-- 3 cles etrangeres sans index de couverture (rsvp_id n'est pas la premiere colonne de leur
-- cle primaire composite, donc l'index de la PK ne sert pas pour un lookup direct par rsvp_id,
-- ni pour la suppression en cascade depuis rsvps).
create index chat_reads_rsvp_id_idx on chat_reads(rsvp_id);
create index date_votes_rsvp_id_idx on date_votes(rsvp_id);
create index message_reactions_rsvp_id_idx on message_reactions(rsvp_id);

-- ============================================================
-- Migration : 20260706175715_add_occasion_extra_fields.sql
-- ============================================================
-- Champs specifiques a l'occasion "cremaillere" (qui recoit, potentiellement plusieurs
-- personnes) et "EVG/EVJF" (le nom du futur marie ou de la future mariee), sur le meme
-- principe que birthday_person/birthday_date/birthday_age deja en place.

alter table events add column housewarming_hosts text[];
alter table events add column bachelor_person text;

-- ============================================================
-- Migration : 20260706183317_add_birthday_photo.sql
-- ============================================================
-- Photo optionnelle de la personne fêtée (occasion "anniversaire"), demandée par Thomas.
-- Stockage : bucket prive "event-photos", un dossier par utilisateur (`{user_id}/...`),
-- verifie via storage.foldername(name) = auth.uid(). Pas de notion d'event_id ici : au
-- moment de l'upload (dans le wizard), l'evenement n'existe pas encore, donc on ne peut
-- pas verifier l'appartenance a un evenement. Comme seul l'hote peut aujourd'hui consulter
-- son propre evenement (pas encore de participants, Phase 4), restreindre a "sa propre
-- fichier" suffit pour l'instant. A revisiter quand des invites pourront aussi voir la
-- photo (Phase 4) : la policy de lecture devra alors s'appuyer sur les memes fonctions
-- private.is_event_admin/is_event_approved_participant que la table events, en passant
-- par l'event_id encode dans le chemin plutot que l'auth.uid() seul.

alter table events add column birthday_photo_path text;

insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', false)
on conflict (id) do nothing;

create policy "event_photos_own_folder_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event_photos_own_folder_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event_photos_own_folder_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "event_photos_own_folder_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============================================================
-- Migration : 20260706183506_rename_to_cover_photo.sql
-- ============================================================
-- Thomas a précisé juste après la migration précédente que la photo doit être
-- disponible pour toutes les occasions (pas seulement l'anniversaire), affichée
-- en rond dans la bannière de l'événement. Renomme la colonne en conséquence
-- (le stockage/bucket "event-photos" restait déjà générique, aucun changement
-- nécessaire de ce côté).

alter table events rename column birthday_photo_path to cover_photo_path;

-- ============================================================
-- Migration : 20260706193633_add_cancelled_at.sql
-- ============================================================
-- Horodatage de l'annulation d'un événement (demande de Thomas : suppression
-- hybride, l'événement annulé reste récupérable 90 jours avant purge
-- définitive par un job planifié). Sans cette date, impossible de savoir
-- depuis quand un événement est annulé pour décider s'il doit être purgé.

alter table events add column cancelled_at timestamptz;

-- ============================================================
-- Migration : 20260706211833_date_poll_voting.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260706221500_guest_identity_and_recovery.sql
-- ============================================================
-- Identité invité + double porte (Phase 3, brief 1.1/1.2).
--
-- `status`, `role` et `guest_code` sont des colonnes de décision jamais
-- accordées en écriture directe au client (voir grants sur `rsvps` dans
-- 20260706101047_rls_policies.sql) : la création de sa propre ligne rsvps
-- passe donc par une fonction `security definer`, comme `ensure_own_rsvp`.
-- Les accompagnants (`companions`) restent insérés directement par le client
-- une fois la ligne rsvps créée : la policy `companions_write_own` suffit.

-- Génère un code personnel unique de récupération cross-device (ex.
-- "INVITE-4291"), même style que generateShortCode côté TS
-- (src/lib/short-code.ts), mais avec des mots différents pour ne jamais
-- confondre un guest_code avec le short_code d'un événement.
create or replace function generate_guest_code()
returns text
language plpgsql
as $$
declare
  words text[] := array['INVITE', 'GUEST', 'COPAIN', 'VOISIN', 'AMI', 'TEAM', 'CREW', 'GANG'];
  v_code text;
begin
  loop
    v_code := words[1 + floor(random() * array_length(words, 1))::int]
      || '-' || (1000 + floor(random() * 9000))::int;
    exit when not exists (select 1 from rsvps where guest_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Crée la ligne rsvps de l'appelant pour un événement donné (statut "pending",
-- rôle "guest" par défaut, brief 1.3 étape 3), avec un guest_code généré côté
-- serveur. Une seule participation par (event, profile) : voir aussi l'index
-- unique rsvps_event_profile_unique, qui reste le filet de sécurité final.
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
returns table (rsvp_id uuid, guest_code text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_guest_code text;
begin
  if exists (
    select 1 from rsvps where event_id = p_event_id and profile_id = (select auth.uid())
  ) then
    raise exception 'une participation existe deja pour cet evenement';
  end if;

  v_guest_code := generate_guest_code();

  insert into rsvps (
    event_id, profile_id, first_name, last_name, phone, gender,
    avatar_kind, avatar_value, status, role, answer, guest_code
  ) values (
    p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
    p_avatar_kind, p_avatar_value, 'pending', 'guest', p_answer, v_guest_code
  )
  returning id into v_rsvp_id;

  return query select v_rsvp_id, v_guest_code;
end;
$$;

revoke execute on function create_own_rsvp(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function create_own_rsvp(uuid, text, text, text, text, text, text, text) to authenticated;

-- Récupération cross-device (brief 1.2) : saisir son guest_code sur un
-- nouvel appareil rattache la participation existante à la session courante
-- (réelle ou anonyme). Retourne le short_code de l'événement pour rediriger.
create or replace function redeem_guest_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rsvp_id uuid;
  v_event_id uuid;
  v_short_code text;
begin
  select id, event_id into v_rsvp_id, v_event_id
  from rsvps
  where guest_code = p_code and is_anonymized = false;

  if v_rsvp_id is null then
    raise exception 'code invalide';
  end if;

  if exists (
    select 1 from rsvps
    where event_id = v_event_id
      and profile_id = (select auth.uid())
      and id <> v_rsvp_id
  ) then
    raise exception 'une participation existe deja sur cet evenement depuis cet appareil';
  end if;

  update rsvps set profile_id = (select auth.uid()) where id = v_rsvp_id;

  select short_code into v_short_code from events where id = v_event_id;
  return v_short_code;
end;
$$;

revoke execute on function redeem_guest_code(text) from public, anon;
grant execute on function redeem_guest_code(text) to authenticated;

-- ============================================================
-- Migration : 20260706222000_expose_allow_companions_preview.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260706223000_fix_generate_guest_code_search_path.sql
-- ============================================================
-- Correctif Security Advisor : generate_guest_code() n'avait pas de
-- search_path fixe (contrairement aux autres fonctions du projet), ce qui la
-- rend vulnerable a un search_path mutable (une session pourrait faire
-- pointer "rsvps" vers une autre table via un schema shadow). Alignee sur la
-- convention du reste du projet (search_path = public, elle ne lit que la
-- table rsvps du schema public).
create or replace function generate_guest_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  words text[] := array['INVITE', 'GUEST', 'COPAIN', 'VOISIN', 'AMI', 'TEAM', 'CREW', 'GANG'];
  v_code text;
begin
  loop
    v_code := words[1 + floor(random() * array_length(words, 1))::int]
      || '-' || (1000 + floor(random() * 9000))::int;
    exit when not exists (select 1 from rsvps where guest_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ============================================================
-- Migration : 20260707000000_increase_guest_code_entropy.sql
-- ============================================================
-- Le guest_code (recuperation cross-device, brief 1.2) n'avait que 8 mots x
-- 9000 combinaisons possibles (4 chiffres) : environ 72 000 codes au total,
-- enumerables en quelques minutes. Un code devine permettrait de reassigner
-- la participation d'une autre personne a sa propre session (redeem_guest_code) :
-- plus grave qu'une simple fuite d'info, un vrai risque de detournement de
-- compte. Suffixe alphanumerique aleatoire (6 caracteres, sans 0/O/1/I
-- ambigus) plutot qu'un nombre a 4 chiffres : 32^6 ≈ 1,07 milliard de
-- combinaisons par mot, largement suffisant vu que le code reste a saisir a
-- la main (pas trop long non plus).
create or replace function generate_guest_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  words text[] := array['INVITE', 'GUEST', 'COPAIN', 'VOISIN', 'AMI', 'TEAM', 'CREW', 'GANG'];
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_suffix text;
  i int;
begin
  loop
    v_suffix := '';
    for i in 1..6 loop
      v_suffix := v_suffix || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    v_code := words[1 + floor(random() * array_length(words, 1))::int] || '-' || v_suffix;
    exit when not exists (select 1 from rsvps where guest_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ============================================================
-- Migration : 20260709000000_admin_validation_and_roles.sql
-- ============================================================
-- Validation par les administrateurs et roles (Phase 4, brief 1.3/1.4/1.5).
--
-- `status`/`role` restent hors de portee des grants clients sur `rsvps`
-- (voir 20260706101047_rls_policies.sql) : toute transition passe par une
-- fonction `security definer` dediee, sur le modele de `create_own_rsvp`.

-- Correctif : `leave_or_remove_participant` appelle `is_my_rsvp`/`is_event_admin`
-- sans prefixe, mais ces fonctions ont ete deplacees dans le schema `private`
-- par une migration ulterieure (20260706105349) sans que celle-ci soit
-- corrigee en consequence. Comme elle n'etait appelee nulle part jusqu'ici,
-- le bug etait invisible ; cette Phase 4 la cable enfin, donc le corriger
-- devient necessaire.
alter function leave_or_remove_participant(uuid, text) set search_path = public, private;

-- Repond "je peux pas" ne declenche jamais de validation admin (brief 1.3) :
-- la ligne est directement creee en acces restreint plutot qu'en attente.
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
returns table (rsvp_id uuid, guest_code text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_guest_code text;
  v_status text;
begin
  if exists (
    select 1 from rsvps where event_id = p_event_id and profile_id = (select auth.uid())
  ) then
    raise exception 'une participation existe deja pour cet evenement';
  end if;

  v_guest_code := generate_guest_code();
  v_status := case when p_answer = 'no' then 'restricted' else 'pending' end;

  insert into rsvps (
    event_id, profile_id, first_name, last_name, phone, gender,
    avatar_kind, avatar_value, status, role, answer, guest_code
  ) values (
    p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
    p_avatar_kind, p_avatar_value, v_status, 'guest', p_answer, v_guest_code
  )
  returning id into v_rsvp_id;

  return query select v_rsvp_id, v_guest_code;
end;
$$;

-- Un admin valide une demande en attente en lui attribuant un role (jamais
-- "admin" directement par ce chemin : promouvoir un participant deja
-- approuve est une action separee, voir `set_participant_role`).
create or replace function admin_approve_rsvp(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  if p_role not in ('guest', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'pending' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set
    status = 'approved',
    role = p_role,
    approved_by = (select auth.uid()),
    approved_at = now(),
    updated_at = now()
  where id = p_rsvp_id;
end;
$$;

revoke execute on function admin_approve_rsvp(uuid, text) from public, anon;
grant execute on function admin_approve_rsvp(uuid, text) to authenticated;

-- Change le role d'un participant deja approuve (invite <-> admin <-> beneficiaire).
create or replace function set_participant_role(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  if p_role not in ('guest', 'admin', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'approved' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set role = p_role, updated_at = now() where id = p_rsvp_id;
end;
$$;

revoke execute on function set_participant_role(uuid, text) from public, anon;
grant execute on function set_participant_role(uuid, text) to authenticated;

-- Un participant change librement sa reponse a tout moment (decision produit :
-- pas de "reconsideration" a sens unique, voir doc/DECISIONS.md). "Je peux
-- pas" bascule immediatement en acces restreint (jamais de validation admin) ;
-- revenir sur "je viens"/"peut-etre" depuis restricted renvoie dans le
-- circuit normal de validation (brief 1.3). Le role d'un participant qui
-- retombe en pending/restricted redevient sans effet de lui-meme : les
-- fonctions RLS (my_rsvp_role, is_event_admin...) n'en tiennent compte que
-- si status = 'approved', donc aucun nettoyage supplementaire n'est requis.
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
    update rsvps set answer = p_answer, status = 'pending', updated_at = now() where id = p_rsvp_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

revoke execute on function update_my_answer(uuid, text) from public, anon;
grant execute on function update_my_answer(uuid, text) to authenticated;

-- ============================================================
-- Migration : 20260709000100_event_photos_participant_access.sql
-- ============================================================
-- Correctif anticipe des la Phase 3 (voir commentaire de
-- 20260706183317_add_birthday_photo.sql:5-10) : jusqu'ici seul l'hote
-- consultait jamais son propre evenement complet, donc restreindre la
-- lecture du bucket "event-photos" a "son propre dossier" suffisait. La
-- Phase 4 (validation des participants) rend ce trou reel : un participant
-- approuve doit voir la photo de couverture (dossier de l'hote) et les
-- avatars-photo des autres participants (onglet Personnes) sans jamais
-- pouvoir lire un fichier hors de tout evenement auquel il participe.
--
-- Policy additionnelle (les policies SELECT permissives se combinent par OR
-- avec "event_photos_own_folder_select" existante) : autorise la lecture
-- d'un fichier si son chemin est reference par la photo de couverture d'un
-- evenement, ou l'avatar-photo d'un participant, auquel l'appelant est admin
-- ou participant approuve.
create policy "event_photos_participant_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos' and (
      exists (
        select 1 from events
        where events.cover_photo_path = storage.objects.name
          and (private.is_event_admin(events.id) or private.is_event_approved_participant(events.id))
      )
      or exists (
        select 1 from rsvps
        where rsvps.avatar_value = storage.objects.name
          and rsvps.avatar_kind = 'photo'
          and (private.is_event_admin(rsvps.event_id) or private.is_event_approved_participant(rsvps.event_id))
      )
    )
  );

-- ============================================================
-- Migration : 20260710000000_chat_phase5.sql
-- ============================================================
-- Le chat (Phase 5, brief 4.3). Le schema (messages, message_reactions,
-- chat_reads) et les RLS de base existent depuis la Phase 1. Cette migration
-- active Realtime, corrige 3 bugs latents decouverts en preparant cette
-- phase, et ajoute ce qui manque (sticker-message, message systeme).

-- a) Realtime : necessaire pour que le chat vive en direct (brief 4.3).
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table message_reactions;

-- b) Anonymisation (brief 1.5/4.3) : rsvps_public_data_select ne filtrait
-- que status = 'approved', rendant une ligne anonymisee (removed/left,
-- deja first_name = null) invisible pour un non-admin. Sans ca, le nom
-- "Anonyme" d'un participant parti ne peut plus se resoudre du tout dans le
-- chat. Elargir ne fuite rien de nouveau (colonnes sensibles deja nulles) ;
-- pending/restricted restent exclus (file d'attente toujours admin-only).
drop policy "rsvps_public_data_select" on rsvps_public_data;
create policy "rsvps_public_data_select" on rsvps_public_data
  for select to authenticated
  using (
    status in ('approved', 'removed', 'left')
    and (private.is_event_admin(event_id) or private.is_event_approved_participant(event_id))
  );

-- c) Masquage Coulisses sur les reactions (bug latent) : contrairement a
-- messages_select, ces policies ne revérifiaient jamais
-- channel = 'main' or not is_event_beneficiary, laissant un beneficiaire
-- potentiellement voir/poser des reactions sur un message backstage.
drop policy "message_reactions_select" on message_reactions;
create policy "message_reactions_select" on message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and (
          private.is_event_admin(m.event_id)
          or (
            private.is_event_approved_participant(m.event_id)
            and (m.channel = 'main' or not private.is_event_beneficiary(m.event_id))
          )
        )
    )
  );

drop policy "message_reactions_write_own" on message_reactions;
create policy "message_reactions_write_own" on message_reactions
  for insert to authenticated
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from messages m
      where m.id = message_id
        and private.is_event_approved_participant(m.event_id)
        and (m.channel = 'main' or not private.is_event_beneficiary(m.event_id))
    )
  );
-- message_reactions_delete_own inchangee : supprimer sa propre reaction ne
-- peut rien fuiter de plus que ce qu'on a deja pu lire/ecrire.

-- d) Fix integrite reply_to (bug latent) : supprimer un message cite en
-- reponse violait la contrainte FK par defaut (NO ACTION), cassant
-- silencieusement "suppression de ses propres messages".
alter table messages drop constraint messages_reply_to_fkey;
alter table messages add constraint messages_reply_to_fkey
  foreign key (reply_to) references messages(id) on delete set null;

-- e) Sticker envoye en tant que message (distinct de la reaction, qui a deja
-- son propre sticker_id sur message_reactions). Meme registre des 5
-- stickers maison existants (src/components/stickers/index.tsx).
alter table messages add column sticker_id text
  check (sticker_id is null or sticker_id in ('confetti', 'gift', 'cake', 'cocktail', 'disco-ball'));
grant insert (sticker_id) on messages to authenticated;

-- f) Message systeme "X a rejoint la fete" (brief 4.3), insere au moment de
-- l'approbation - seul point de passage vers status = 'approved'. `body`
-- contient une cle machine ("joined"), jamais du texte fige (convention
-- i18n du projet) : resolu cote client via
-- t("Chat.systemMessages.joined", { name }). rsvp_id est renseigne
-- (contrairement a la convention "system = rsvp_id null") pour pouvoir
-- resoudre le prenom au moment de l'affichage via rsvps_public_data.
create or replace function admin_approve_rsvp(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  if p_role not in ('guest', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'pending' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set
    status = 'approved',
    role = p_role,
    approved_by = (select auth.uid()),
    approved_at = now(),
    updated_at = now()
  where id = p_rsvp_id;

  insert into messages (event_id, rsvp_id, channel, is_system, body)
  values (v_event_id, p_rsvp_id, 'main', true, 'joined');
end;
$$;

-- g) Policy Storage pour les photos de message (bucket prive event-photos) :
-- le pattern existant (event_photos_participant_select) ne couvre que la
-- cover photo et les avatars, pas les photos postees dans le chat.
create policy "event_photos_message_photo_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos' and exists (
      select 1 from messages
      where messages.photo_url = storage.objects.name
        and (
          private.is_event_admin(messages.event_id)
          or (
            private.is_event_approved_participant(messages.event_id)
            and (messages.channel = 'main' or not private.is_event_beneficiary(messages.event_id))
          )
        )
    )
  );

-- ============================================================
-- Migration : 20260710000100_fix_ensure_own_rsvp_identity.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260710000200_message_edit_admin_only_delete.sql
-- ============================================================
-- Decision produit (retour Thomas en testant le chat, Phase 5) : la
-- suppression d'un message reste reservee aux admins (moderation douce,
-- deja en place via messages_moderate_admin/deleted_by_admin). L'auteur
-- d'un message peut a la place le modifier, mais seulement dans les 30
-- secondes suivant l'envoi (le temps de corriger une faute de frappe, pas
-- de reecrire l'historique). Passe ce delai, plus aucune modification
-- possible de son cote.

-- Retire la suppression physique de son propre message : seule la
-- moderation admin (soft delete via deleted_by_admin) permet de faire
-- disparaitre un message desormais, quel qu'en soit l'auteur.
drop policy "messages_delete_own" on messages;

-- Edition de son propre message dans les 30 secondes suivant l'envoi.
-- security definer : `body` n'est pas dans les colonnes update accordees au
-- client (voir grants sur messages, rls_policies.sql), la fenetre de temps
-- doit aussi etre verifiee cote serveur, pas seulement par l'UI.
create or replace function edit_own_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_is_system boolean;
  v_created_at timestamptz;
begin
  select rsvp_id, is_system, created_at into v_rsvp_id, v_is_system, v_created_at
  from messages where id = p_message_id;

  if v_rsvp_id is null then
    raise exception 'message not found';
  end if;

  if not is_my_rsvp(v_rsvp_id) then
    raise exception 'not authorized';
  end if;

  if v_is_system then
    raise exception 'system messages cannot be edited';
  end if;

  if v_created_at < now() - interval '30 seconds' then
    raise exception 'edit window expired';
  end if;

  update messages set body = p_body where id = p_message_id;
end;
$$;

revoke execute on function edit_own_message(uuid, text) from public, anon;
grant execute on function edit_own_message(uuid, text) to authenticated;

-- ============================================================
-- Migration : 20260710000300_one_reaction_per_user.sql
-- ============================================================
-- Decision produit (retour Thomas, Phase 5) : un participant ne peut poser
-- qu'une seule reaction par message (pas une par emoji). La cle primaire
-- (message_id, rsvp_id, sticker_id) autorisait plusieurs lignes par
-- (message, participant) avec des emojis differents ; passe a
-- (message_id, rsvp_id) seul, sticker_id devient une colonne ordinaire
-- (changer d'emoji met simplement a jour la ligne existante via upsert).

-- Deduplique les donnees de test existantes (projet pre-lancement, aucune
-- vraie donnee) avant de poser la nouvelle contrainte : garde une seule
-- ligne arbitraire par (message_id, rsvp_id).
delete from message_reactions a using message_reactions b
  where a.message_id = b.message_id
    and a.rsvp_id = b.rsvp_id
    and a.sticker_id > b.sticker_id;

alter table message_reactions drop constraint message_reactions_pkey;
alter table message_reactions add primary key (message_id, rsvp_id);

-- Aucune policy UPDATE n'existait (seul insert etait prevu, une reaction ne
-- changeait jamais de valeur avant ce correctif) : necessaire maintenant
-- que changer d'avis sur l'emoji met a jour la ligne existante au lieu
-- d'en creer une nouvelle.
grant update (sticker_id) on message_reactions to authenticated;

create policy "message_reactions_update_own" on message_reactions
  for update to authenticated
  using (private.is_my_rsvp(rsvp_id))
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from messages m
      where m.id = message_reactions.message_id
        and private.is_event_approved_participant(m.event_id)
        and (m.channel = 'main' or not private.is_event_beneficiary(m.event_id))
    )
  );

-- ============================================================
-- Migration : 20260710000400_reaction_replica_identity_full.sql
-- ============================================================
-- Necessaire pour que le changement d'emoji (Phase 5, une seule reaction par
-- participant) soit correctement reflete en temps reel chez les autres :
-- avec la replica identity par defaut (cle primaire seule), l'evenement
-- Realtime UPDATE ne contient que (message_id, rsvp_id) dans "old", jamais
-- l'ancien sticker_id, empechant de decrementer le bon compteur cote client.
alter table message_reactions replica identity full;

-- ============================================================
-- Migration : 20260710000500_realtime_rsvps_and_fixes.sql
-- ============================================================
-- Trois correctifs decouverts en testant en direct (retours Thomas) :

-- 1. La liste "Personnes" (EventPersonnes/ParticipantsList) n'ecoutait aucun
-- canal Realtime : un nouveau participant (ou la ligne de l'hote, desormais
-- creee eagerement, voir page.tsx) n'apparaissait qu'apres un rechargement
-- complet de la page. `rsvps` rejoint donc `messages`/`message_reactions`
-- dans la publication Realtime ; RLS continue de filtrer normalement ce que
-- chaque abonne recoit (meme mecanisme que pour le chat, cf. migration
-- 20260710000000).
alter publication supabase_realtime add table rsvps;

-- 2. Retirer le role admin d'un participant ne doit jamais laisser
-- l'evenement sans aucun admin explicite (role='admin', approved) : l'hote
-- a toujours un pouvoir implicite via is_event_host, mais un evenement sans
-- aucune ligne "admin" visible est une source de confusion et de risque
-- (plus personne ne se voit visuellement responsable de la moderation).
create or replace function set_participant_role(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
  v_current_role text;
  v_other_admins integer;
begin
  if p_role not in ('guest', 'admin', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status, role into v_event_id, v_status, v_current_role from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'approved' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  if v_current_role = 'admin' and p_role <> 'admin' then
    select count(*) into v_other_admins
    from rsvps
    where event_id = v_event_id and status = 'approved' and role = 'admin' and id <> p_rsvp_id;

    if v_other_admins = 0 then
      raise exception 'last admin cannot be demoted';
    end if;
  end if;

  update rsvps set role = p_role, updated_at = now() where id = p_rsvp_id;
end;
$$;

-- 3. `edit_own_message` : le compositeur n'a jamais permis d'envoyer une
-- photo accompagnee d'un texte (voir MessageComposer.tsx, deux boutons
-- d'envoi exclusifs) et l'affichage (MessageBubble.tsx) est lui aussi
-- exclusif (photo OU texte, jamais les deux). Editer un message revient donc
-- toujours a le remplacer par du texte pur : sans cela, editer un message
-- photo pour le remplacer par du texte laissait `photo_url` intact, et
-- l'affichage continuait a montrer l'ancienne photo au lieu du nouveau texte.
create or replace function edit_own_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_is_system boolean;
  v_created_at timestamptz;
begin
  select rsvp_id, is_system, created_at into v_rsvp_id, v_is_system, v_created_at
  from messages where id = p_message_id;

  if v_rsvp_id is null then
    raise exception 'message not found';
  end if;

  if not is_my_rsvp(v_rsvp_id) then
    raise exception 'not authorized';
  end if;

  if v_is_system then
    raise exception 'system messages cannot be edited';
  end if;

  if v_created_at < now() - interval '30 seconds' then
    raise exception 'edit window expired';
  end if;

  update messages set body = p_body, photo_url = null where id = p_message_id;
end;
$$;

-- ============================================================
-- Migration : 20260710000600_pot_access_requires_admin_grant.sql
-- ============================================================
-- Decision produit (question directe de Thomas apres avoir teste le parcours
-- "je ne peux pas") : l'acces "cagnotte seule" (brief 1.3) etait accorde
-- instantanement a QUICONQUE recevait le lien et repondait "je ne peux pas",
-- sans aucune validation de l'hote. Thomas a choisi de durcir : la cagnotte
-- ne s'affiche desormais qu'apres une autorisation explicite d'un admin.

alter table rsvps add column pot_access_granted boolean not null default false;

-- Cote lecture : remplace is_event_restricted_participant seul par une
-- verification qui exige aussi pot_access_granted sur SA PROPRE ligne. Policy
-- recreee avec le prefixe private. (convention pour toute nouvelle policy,
-- voir 20260706105349_move_rls_helpers_to_private_schema.sql).
create function private.has_pot_access(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from rsvps
    where event_id = p_event_id
      and profile_id = (select auth.uid())
      and status = 'restricted'
      and pot_access_granted
  );
$$;

revoke execute on function private.has_pot_access(uuid) from public, anon;
grant execute on function private.has_pot_access(uuid) to authenticated;

drop policy "events_pot_data_select" on events_pot_data;
create policy "events_pot_data_select" on events_pot_data
  for select to authenticated
  using (
    status = 'active'
    and (
      private.has_pot_access(id)
      or private.is_event_approved_participant(id)
      or private.is_event_admin(id)
    )
  );

-- Cote ecriture : seul un admin peut accorder cet acces, et seulement sur une
-- ligne encore "restricted" (une fois approuvee/retiree, ce n'est plus le bon
-- levier).
create function grant_pot_access(p_rsvp_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'restricted' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set pot_access_granted = true, updated_at = now() where id = p_rsvp_id;
end;
$$;

revoke execute on function grant_pot_access(uuid) from public, anon;
grant execute on function grant_pot_access(uuid) to authenticated;

-- ============================================================
-- Migration : 20260710000700_pot_access_opt_in_request.sql
-- ============================================================
-- Affinage produit (Thomas, juste apres avoir teste le durcissement
-- precedent) : plutot que de presenter un bouton "Autoriser la cagnotte" pour
-- CHAQUE personne "je ne peux pas" (la plupart ne se soucient pas du tout de
-- la cagnotte), on demande d'abord au participant restreint lui-meme s'il
-- veut quand meme y participer. Seul un "oui" explicite de sa part cree une
-- vraie demande visible cote admin ; sinon il reste juste dans la liste "Ne
-- peuvent pas venir", sans aucune information ni action liee a la cagnotte.

alter table rsvps add column wants_pot_access boolean not null default false;

-- Auto-service : le participant pose lui-meme ce drapeau sur SA ligne, comme
-- pour answer/avatar_kind... (rsvps_update_own couvre deja "sa propre ligne",
-- il ne manquait que le grant sur cette colonne precise).
grant update (wants_pot_access) on rsvps to authenticated;

-- ============================================================
-- Migration : 20260710000800_expose_pot_enabled_preview.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260710000900_deny_pot_access_request.sql
-- ============================================================
-- Affinage produit (Thomas, meme fil que la demande d'acces cagnotte en 2
-- temps) : un participant restreint qui n'a PAS demande a participer a la
-- cagnotte ne doit generer AUCUNE action pour l'admin (ni "autoriser" ni
-- "retirer") -- il est deja sans acces, rien a gerer. Seule une demande
-- explicite de sa part cree une vraie decision admin, symetrique a la file
-- d'attente normale : "Approuver" (grant_pot_access, deja en place) ou
-- "Refuser" (cette fonction), qui remet simplement wants_pot_access a false.
create function deny_pot_access(p_rsvp_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
begin
  select event_id, status into v_event_id, v_status from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'restricted' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set wants_pot_access = false, updated_at = now() where id = p_rsvp_id;
end;
$$;

revoke execute on function deny_pot_access(uuid) from public, anon;
grant execute on function deny_pot_access(uuid) to authenticated;

-- ============================================================
-- Migration : 20260710001000_rsvps_replica_identity_full.sql
-- ============================================================
-- Bug reel decouvert en diagnostiquant "je ne veux pas devoir refresh" : le
-- canal Realtime "rsvps" (EventTabs) etait SUBSCRIBED cote client (aucune
-- erreur visible dans l'app), mais ne recevait strictement AUCUN evenement
-- (ni INSERT, ni UPDATE), malgre la table bien presente dans la publication
-- supabase_realtime. Cause trouvee en inspectant les frames WebSocket brutes :
-- le serveur Realtime renvoie un message "system" d'exception juste apres le
-- "ok" de join, quand on demande `event: "*"` (INSERT+UPDATE+DELETE) avec un
-- filtre sur une colonne (`event_id`) absente de la replica identity par
-- defaut (juste la cle primaire) : impossible de filtrer un DELETE sans que
-- `event_id` soit present dans la ligne "old", ce qui fait echouer
-- l'abonnement pour LES TROIS types d'evenements a la fois, pas seulement
-- DELETE. Meme classe de probleme deja rencontree (et corrigee) sur
-- `message_reactions` en Phase 5, jamais appliquee a `rsvps`.
alter table rsvps replica identity full;

-- ============================================================
-- Migration : 20260710001100_rsvps_public_data_realtime.sql
-- ============================================================
-- Bug reel signale par Thomas : le refresh automatique de "Personnes"
-- fonctionnait pour un admin mais pas pour un simple participant. Cause :
-- l'abonnement Realtime (EventTabs.tsx) ecoute la table brute `rsvps`, dont
-- la policy `rsvps_select_own_or_admin` ne montre a un NON-admin que SA
-- PROPRE ligne (`profile_id = auth.uid() OR is_event_admin(event_id)`) — un
-- simple invite ne recevait donc jamais l'evenement Realtime pour le
-- changement de quelqu'un d'autre. `rsvps_public_data` (table miroir,
-- policy bien plus permissive : tout admin OU participant approuve peut
-- voir les autres participants approuves/retires/partis) n'etait pas encore
-- dans la publication Realtime.
alter publication supabase_realtime add table rsvps_public_data;

-- ============================================================
-- Migration : 20260710001200_rejoin_restores_identity.sql
-- ============================================================
-- Decision produit (Thomas) : si une personne qui a quitte (statut "left")
-- OU qui a ete retiree par un admin (statut "removed") revient plus tard sur
-- le meme evenement, elle doit retrouver son vrai nom PARTOUT, y compris sur
-- ses anciens messages de chat -- pas seulement sur une nouvelle ligne
-- fraiche qui laisserait l'ancienne anonyme pour toujours.
--
-- Jusqu'ici, l'anonymisation (leave_or_remove_participant) remettait aussi
-- `profile_id` a null, coupant tout lien retrouvable entre le compte reel et
-- son ancienne ligne rsvps -- un retour creait donc systematiquement une
-- TOUTE NOUVELLE ligne (aucune contrainte unique ne s'y opposait, puisque
-- `rsvps_event_profile_unique` ne porte que sur profile_id non-null), et
-- l'ancienne ligne (et tous les messages qui pointent dessus) restait
-- anonyme pour de bon.
--
-- Correctif : ne plus jamais nullifier profile_id a l'anonymisation (rien
-- d'autre n'en depend cote confidentialite -- jamais expose via
-- rsvps_public_data). `create_own_rsvp` reconnait alors l'ancienne ligne au
-- retour (meme profile_id, meme evenement) et la REACTIVE (identite/statut
-- remis a neuf) plutot que d'echouer ou d'en creer une seconde -- restaurant
-- du meme coup le nom sur tout l'historique de chat deja lie a ce rsvp_id.

create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id into v_event_id from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  -- 1. Nettoyage des engagements (les jauges/ratios se recalculent automatiquement,
  --    puisqu'ils sont derives par comptage des lignes restantes)
  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  -- 2. Anonymisation de l'identite (les messages et pot_contributions restent, "Anonyme"
  --    via la jointure -- voir rsvps_public qui affichera first_name = null).
  --    profile_id N'EST PLUS nullifie (voir commentaire de migration ci-dessus) :
  --    le lien avec le compte reel reste pour permettre une reactivation propre
  --    si la personne revient un jour sur cet evenement.
  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    guest_code = null,
    updated_at = now()
  where id = p_rsvp_id;

  -- 3. La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

-- Reactive une ancienne ligne anonymisee (meme compte, meme evenement) au
-- lieu d'en creer une seconde ou d'echouer : identite/statut remis a neuf,
-- le rsvp_id (et donc tout son historique de chat) reste le meme.
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
returns table (rsvp_id uuid, guest_code text)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_guest_code text;
  v_status text;
  v_existing_id uuid;
  v_existing_status text;
begin
  select id, status into v_existing_id, v_existing_status
  from rsvps
  where event_id = p_event_id and profile_id = (select auth.uid());

  if v_existing_id is not null and v_existing_status not in ('removed', 'left') then
    raise exception 'une participation existe deja pour cet evenement';
  end if;

  v_guest_code := generate_guest_code();
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
      guest_code = v_guest_code,
      is_anonymized = false,
      updated_at = now()
    where id = v_existing_id;
    v_rsvp_id := v_existing_id;
  else
    insert into rsvps (
      event_id, profile_id, first_name, last_name, phone, gender,
      avatar_kind, avatar_value, status, role, answer, guest_code
    ) values (
      p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
      p_avatar_kind, p_avatar_value, v_status, 'guest', p_answer, v_guest_code
    )
    returning id into v_rsvp_id;
  end if;

  return query select v_rsvp_id, v_guest_code;
end;
$$;

-- ============================================================
-- Migration : 20260710001300_fix_leave_search_path.sql
-- ============================================================
-- Correctif : la migration 20260710001200 a recree leave_or_remove_participant
-- en copiant l'ancien entete `set search_path = public` (sans `private`),
-- ecrasant par megarde le correctif pose par une migration anterieure
-- (20260709000000_admin_validation_and_roles.sql) qui ajoutait `private` a
-- ce search_path suite au deplacement de is_my_rsvp/is_event_admin dans le
-- schema private. Consequence : tout appel a leave_or_remove_participant
-- echouait silencieusement ("function is_my_rsvp does not exist"), donc
-- "Quitter l'evenement" ne modifiait plus jamais la ligne rsvps.
alter function leave_or_remove_participant(uuid, text) set search_path = public, private;

-- ============================================================
-- Migration : 20260710001400_fix_avatar_photo_storage_visibility.sql
-- ============================================================
-- Bug reel signale par Thomas en testant avec 3 comptes : l'avatar-photo
-- d'un participant s'affiche correctement pour un admin, mais reste le
-- mascotte par defaut pour un participant non-admin regardant la MEME photo.
--
-- Cause : "event_photos_participant_select" (20260709000100) verifie
-- l'avatar via `exists (select 1 from rsvps where rsvps.avatar_value = ...)`.
-- Cette sous-requete porte sur la table BRUTE `rsvps`, donc sa propre RLS
-- ("rsvps_select_own_or_admin" : profile_id = auth.uid() OU admin) s'applique
-- AVANT meme la condition explicite de cette policy Storage -- un participant
-- non-admin ne peut donc jamais y voir la ligne d'un AUTRE participant,
-- meme si "is_event_approved_participant" est vrai. `createSignedUrl` echoue
-- alors silencieusement (data.signedUrl est absent), et le code cote client
-- retombe sur `null` -- donc l'avatar par defaut (voir resolveAvatarUrl).
--
-- Correctif : pointer cette sous-requete sur `rsvps_public_data` (table
-- miroir deja synchronisee, avatar_kind/avatar_value inclus, policy SELECT
-- deja plus permissive : tout participant approuve OU admin voit toutes les
-- lignes approved/removed/left de l'evenement) plutot que sur `rsvps`.
drop policy "event_photos_participant_select" on storage.objects;

create policy "event_photos_participant_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos' and (
      exists (
        select 1 from events
        where events.cover_photo_path = storage.objects.name
          and (private.is_event_admin(events.id) or private.is_event_approved_participant(events.id))
      )
      or exists (
        select 1 from rsvps_public_data
        where rsvps_public_data.avatar_value = storage.objects.name
          and rsvps_public_data.avatar_kind = 'photo'
          and (
            private.is_event_admin(rsvps_public_data.event_id)
            or private.is_event_approved_participant(rsvps_public_data.event_id)
          )
      )
    )
  );

-- ============================================================
-- Migration : 20260710001500_restricted_status_realtime_visibility.sql
-- ============================================================
-- Bug reel signale par Thomas : quand un participant approuve passe a
-- "restricted" (Je ne peux pas), un AUTRE participant non-admin reste sur
-- l'onglet Personnes SANS que la personne ne disparaisse de la liste --
-- oblige a rafraichir manuellement. Fonctionne correctement pour un admin.
--
-- Cause : "rsvps_public_data_select" (20260706104902, etendue par
-- 20260710000000 pour couvrir removed/left) n'autorise que
-- status in ('approved','removed','left'). Des qu'une ligne bascule sur
-- 'restricted', elle devient invisible selon cette policy pour un abonne
-- non-admin -- Postgres Realtime evalue la RLS de la ligne APRES
-- modification avant de decider de transmettre l'evenement UPDATE a cet
-- abonne : la ligne echouant desormais la policy, l'evenement n'est jamais
-- livre, donc EventTabs ne recoit rien et ne declenche jamais
-- `router.refresh()`. Un admin, lui, voit tout via `is_event_admin` sur la
-- table brute `rsvps`, d'ou la difference de comportement observee.
--
-- Correctif : ajouter 'restricted' aux statuts visibles par cette policy.
-- Sans danger cote fuite d'information : `EventPersonnes.tsx` (requete
-- non-admin) filtre deja explicitement `.eq("status", "approved")` -- cet
-- elargissement ne sert qu'a permettre a l'evenement Realtime d'etre
-- LIVRE (declenchant un refresh qui refait la requete filtree, donc la
-- personne disparait bien de la liste), jamais a l'afficher directement.
drop policy "rsvps_public_data_select" on rsvps_public_data;

create policy "rsvps_public_data_select" on rsvps_public_data
  for select to authenticated
  using (
    status in ('approved', 'removed', 'left', 'restricted')
    and (private.is_event_admin(event_id) or private.is_event_approved_participant(event_id))
  );

-- ============================================================
-- Migration : 20260710001600_pot_access_reset_and_revoke.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260710001700_events_table_realtime.sql
-- ============================================================
-- Retour Thomas : une modification faite via le wizard "Modifier" (titre,
-- date, adresse, theme, qui peut partager le lien, cagnotte...) ne se
-- reflete jamais chez les autres participants deja sur la page evenement
-- sans qu'ils fassent F5 -- la table `events` elle-meme n'avait jamais ete
-- ajoutee a la publication Realtime, contrairement a `rsvps`/`rsvps_public_data`
-- (migration 20260710000500) et `messages`/`message_reactions`
-- (migration 20260710000000). RLS (`events_select_full_for_participants`,
-- admin OU participant approuve) continue de filtrer normalement ce que
-- chaque abonne recoit reellement, meme mecanisme deja etabli.
alter publication supabase_realtime add table events;

-- ============================================================
-- Migration : 20260710001800_date_votes_realtime.sql
-- ============================================================
-- Retour Thomas (suite de la question "faut-il que toutes les tables se
-- refreshent") : le sondage de date doit aussi se mettre a jour en direct --
-- voter (`voteDateOption`, upsert/delete sur `date_votes`) ne touche jamais
-- `events` ni `rsvps`, donc restait invisible pour un autre participant deja
-- sur l'onglet Accueil sans F5. `date_options` n'a pas besoin du meme
-- traitement : elle n'est ecrite que par `updateEvent` (wizard "Modifier"),
-- toujours dans la MEME requete qu'une mise a jour de `events`, deja
-- realtime depuis la migration precedente.
alter publication supabase_realtime add table date_votes;

-- ============================================================
-- Migration : 20260710001900_transfer_event_host.sql
-- ============================================================
-- Retour Thomas : impossible aujourd'hui pour l'hote (createur) de quitter
-- son propre evenement, meme apres avoir promu un autre admin -- host_id est
-- une colonne fixe sur `events`, jamais transferee, et is_event_host (donc
-- is_event_admin) reste vrai pour l'hote quoi qu'il arrive a sa ligne rsvps.
-- Decision (question posee a Thomas, option retenue) : un transfert EXPLICITE
-- de l'organisation vers un autre admin deja approuve, avant de pouvoir
-- utiliser le circuit normal "Quitter l'evenement" (leave_or_remove_participant,
-- deja en place). Jamais un simple update client-side de `host_id` (la policy
-- events_update_by_admin autoriserait n'importe quel admin a le faire vers
-- n'importe quel profil, meme pas admin) : fonction dediee qui verifie a la
-- fois que l'appelant est bien l'HOTE actuel (pas un admin promu) et que la
-- cible est deja un admin approuve de cet evenement.
create or replace function transfer_event_host(p_event_id uuid, p_new_host_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_new_host_status text;
  v_new_host_role text;
begin
  if not is_event_host(p_event_id) then
    raise exception 'not authorized';
  end if;

  select status, role into v_new_host_status, v_new_host_role
  from rsvps
  where event_id = p_event_id and profile_id = p_new_host_profile_id;

  if v_new_host_status is distinct from 'approved' or v_new_host_role <> 'admin' then
    raise exception 'new host must be an approved admin';
  end if;

  update events set host_id = p_new_host_profile_id where id = p_event_id;
end;
$$;

grant execute on function transfer_event_host(uuid, uuid) to authenticated;

-- ============================================================
-- Migration : 20260710002000_transfer_host_real_account_only.sql
-- ============================================================
-- Retour Thomas : un admin en session anonyme ("code d'accès") qui devient
-- organisateur est un risque réel -- s'il perd sa session (cookies effacés,
-- autre appareil) et la récupère via son code d'invité, `redeem_guest_code`
-- ne réassigne que sa ligne `rsvps` (profile_id), jamais `events.host_id`.
-- L'événement se retrouverait avec un "organisateur" définitivement
-- inaccessible, sans plus aucun moyen de retransférer (seul l'organisateur
-- actuel peut le faire). Même raison que `createEvent` exige déjà un vrai
-- compte : l'organisateur doit avoir une identité durable.
create or replace function transfer_event_host(p_event_id uuid, p_new_host_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_new_host_status text;
  v_new_host_role text;
  v_new_host_is_anonymous boolean;
begin
  if not is_event_host(p_event_id) then
    raise exception 'not authorized';
  end if;

  select status, role into v_new_host_status, v_new_host_role
  from rsvps
  where event_id = p_event_id and profile_id = p_new_host_profile_id;

  if v_new_host_status is distinct from 'approved' or v_new_host_role <> 'admin' then
    raise exception 'new host must be an approved admin';
  end if;

  select is_anonymous into v_new_host_is_anonymous
  from auth.users
  where id = p_new_host_profile_id;

  if v_new_host_is_anonymous then
    raise exception 'new host must have a real account, not an anonymous session';
  end if;

  update events set host_id = p_new_host_profile_id where id = p_event_id;
end;
$$;

-- Nécessaire pour que la liste Personnes puisse savoir qui a un vrai compte
-- (symbole visuel + masquer/expliquer "Transférer l'organisation" pour un
-- admin anonyme) : `auth.users` n'est pas exposée via l'API REST classique
-- ("Invalid schema: auth", confirmé en diagnostic), une fonction dédiée y
-- accède normalement en SQL. Réservée aux admins de l'événement concerné
-- (silencieusement 0 ligne sinon, même logique que les autres fonctions
-- `security definer` de lecture de ce projet).
create or replace function get_event_participants_account_type(p_event_id uuid)
returns table (profile_id uuid, is_anonymous boolean)
language sql
stable
security definer
set search_path = public, private
as $$
  select r.profile_id, u.is_anonymous
  from rsvps r
  join auth.users u on u.id = r.profile_id
  where r.event_id = p_event_id
    and is_event_admin(p_event_id);
$$;

grant execute on function get_event_participants_account_type(uuid) to authenticated;

-- ============================================================
-- Migration : 20260710002100_organizer_untouchable.sql
-- ============================================================
-- Retour Thomas : "j'ai mon 2eme compte qui est admin, et je sais supprimer
-- ou changer le role de l'organisateur. ce n'est pas logique ca." -- vrai
-- trou : `set_participant_role`/`leave_or_remove_participant` n'autorisaient
-- que sur `is_event_admin`, sans jamais verifier si la ligne CIBLEE etait
-- celle de l'organisateur (`events.host_id`). Un admin promu pouvait donc
-- retrograder ou "retirer" (anonymiser) l'organisateur, qui gardait ses
-- vrais pouvoirs (host_id inchange) mais se retrouvait dans un etat
-- incoherent (role corrompu, ou identite effacee alors qu'il a toujours
-- acces). Regles retenues (question posee a Thomas) :
-- 1. L'organisateur est intouchable, y compris pour lui-meme via ces deux
--    fonctions -- la seule facon d'arreter d'etre organisateur reste le
--    transfert explicite (transfer_event_host).
-- 2. Entre admins ordinaires (ni l'un ni l'autre organisateur) : egalite,
--    n'importe quel admin peut gerer n'importe quel autre admin (garde-fou
--    "jamais le dernier admin" deja en place, inchange).

create or replace function set_participant_role(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
  v_current_role text;
  v_other_admins integer;
begin
  if p_role not in ('guest', 'admin', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status, role into v_event_id, v_status, v_current_role from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'cannot change the organizer role, transfer the organization instead';
  end if;

  if v_status <> 'approved' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  if v_current_role = 'admin' and p_role <> 'admin' then
    select count(*) into v_other_admins
    from rsvps
    where event_id = v_event_id and status = 'approved' and role = 'admin' and id <> p_rsvp_id;

    if v_other_admins = 0 then
      raise exception 'last admin cannot be demoted';
    end if;
  end if;

  update rsvps set role = p_role, updated_at = now() where id = p_rsvp_id;
end;
$$;

create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id into v_event_id from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'the organizer cannot leave or be removed, transfer the organization first';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  -- 1. Nettoyage des engagements (les jauges/ratios se recalculent automatiquement,
  --    puisqu'ils sont derives par comptage des lignes restantes)
  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  -- 2. Anonymisation de l'identite (les messages et pot_contributions restent, "Anonyme"
  --    via la jointure -- voir rsvps_public qui affichera first_name = null).
  --    profile_id N'EST PLUS nullifie (voir commentaire de migration ci-dessus) :
  --    le lien avec le compte reel reste pour permettre une reactivation propre
  --    si la personne revient un jour sur cet evenement.
  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    guest_code = null,
    updated_at = now()
  where id = p_rsvp_id;

  -- 3. La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

-- ============================================================
-- Migration : 20260710002200_beneficiary_visibility_wizard.sql
-- ============================================================
-- Retour Thomas : "il faut une etape 5 [dans le wizard], avec le ou les
-- beneficiaires peuvent voir la cagnotte, le chat, les personnes, qui
-- apporte quoi etc." -- jusqu'ici, `beneficiary_hidden_blocks` (text[),
-- deja en base) ne pilotait QUE bring/polls/playlist (aucune UI ne l'a
-- jamais rempli), et la cagnotte / le fil Coulisses etaient codes en dur
-- "toujours masques au beneficiaire", jamais desactivables.
--
-- Decisions confirmees avec Thomas (plusieurs allers-retours, voir
-- DECISIONS.md pour le detail complet) :
-- 1. La cagnotte devient configurable comme le reste (nouvelle valeur 'pot').
-- 2. Le fil COULISSES (canal 'backstage') devient configurable (nouvelle
--    valeur 'backstage', remplace la regle codee en dur
--    is_event_beneficiary) : "dans coulisses, s'il est coche il ne voit
--    pas le chat coulisses". Les deux onglets General/Coulisses restent
--    TOUJOURS visibles (cote applicatif) meme pour un beneficiaire bloque
--    -- seul le contenu de l'onglet actif est remplace par un message
--    "pas d'acces", jamais tout le panneau.
-- 3. Le CHAT GENERAL (canal 'main') devient LUI AUSSI configurable
--    (nouvelle valeur 'chat', ajoutee apres coup -- Thomas avait d'abord
--    demande qu'il reste toujours accessible, puis est revenu dessus en
--    constatant qu'un beneficiaire masque de la liste Personnes restait
--    quand meme visible comme auteur de messages dans le chat general :
--    "rajouter une possibilite de masquer le chat general pour les
--    beneficiaires"). Meme mecanique exacte que Coulisses (onglet toujours
--    visible, contenu remplace si bloque).
--
-- La liste Personnes (bloc 'participants', demande aussi par Thomas) N'EST
-- PAS ajoutee a cette meme mecanique RLS : rsvps_public_data sert aussi a
-- resoudre les noms d'auteur dans le chat (ChatRoom.resolveAuthor), la
-- restreindre casserait ca pour tout le monde. Ce bloc reste masque au
-- niveau applicatif uniquement (page.tsx ne rend pas <EventPersonnes> pour
-- un beneficiaire concerne) -- protection plus legere que les 5 autres
-- blocs RLS, assumee et documentee, pas une regression cachee.

-- ============================================================
-- a) Cagnotte : desormais pilotee par is_block_hidden_for_me(event_id, 'pot')
-- au lieu de is_event_beneficiary(event_id) code en dur. Meme pattern deja
-- utilise pour playlist_select (admin toujours ; participant approuve
-- seulement si le bloc n'est pas masque pour lui).
-- ============================================================
drop policy "pot_contributions_select" on pot_contributions;
create policy "pot_contributions_select" on pot_contributions
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (private.is_event_approved_participant(event_id) and not private.is_block_hidden_for_me(event_id, 'pot'))
  );
-- pot_payouts_select_admin (details Stripe) INCHANGEE : jamais montre a un
-- beneficiaire meme admin, hors perimetre de cette demande.

-- ============================================================
-- b) Chat, les deux canaux ('main' ET 'backstage') desormais pilotes
-- chacun par leur propre entree dans beneficiary_hidden_blocks
-- ('chat'/'backstage'), au lieu de is_event_beneficiary(event_id) code en
-- dur (qui ne s'appliquait de toute facon qu'a 'backstage'). Corps repris
-- tel quel depuis la derniere version connue de chaque policy
-- (20260710000000_chat_phase5.sql / 20260710000300_one_reaction_per_user.sql),
-- seule la condition par canal change.
-- ============================================================
drop policy "messages_select" on messages;
create policy "messages_select" on messages
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (
      private.is_event_approved_participant(event_id)
      and (
        (channel = 'main' and not private.is_block_hidden_for_me(event_id, 'chat'))
        or (channel = 'backstage' and not private.is_block_hidden_for_me(event_id, 'backstage'))
      )
    )
  );

drop policy "messages_insert_own" on messages;
create policy "messages_insert_own" on messages
  for insert to authenticated
  with check (
    private.is_event_approved_participant(event_id)
    and private.is_my_rsvp(rsvp_id)
    and (
      (channel = 'main' and not private.is_block_hidden_for_me(event_id, 'chat'))
      or (channel = 'backstage' and not private.is_block_hidden_for_me(event_id, 'backstage'))
    )
  );

drop policy "message_reactions_select" on message_reactions;
create policy "message_reactions_select" on message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and (
          private.is_event_admin(m.event_id)
          or (
            private.is_event_approved_participant(m.event_id)
            and (
              (m.channel = 'main' and not private.is_block_hidden_for_me(m.event_id, 'chat'))
              or (m.channel = 'backstage' and not private.is_block_hidden_for_me(m.event_id, 'backstage'))
            )
          )
        )
    )
  );

drop policy "message_reactions_write_own" on message_reactions;
create policy "message_reactions_write_own" on message_reactions
  for insert to authenticated
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from messages m
      where m.id = message_id
        and private.is_event_approved_participant(m.event_id)
        and (
          (m.channel = 'main' and not private.is_block_hidden_for_me(m.event_id, 'chat'))
          or (m.channel = 'backstage' and not private.is_block_hidden_for_me(m.event_id, 'backstage'))
        )
    )
  );

drop policy "message_reactions_update_own" on message_reactions;
create policy "message_reactions_update_own" on message_reactions
  for update to authenticated
  using (private.is_my_rsvp(rsvp_id))
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from messages m
      where m.id = message_reactions.message_id
        and private.is_event_approved_participant(m.event_id)
        and (
          (m.channel = 'main' and not private.is_block_hidden_for_me(m.event_id, 'chat'))
          or (m.channel = 'backstage' and not private.is_block_hidden_for_me(m.event_id, 'backstage'))
        )
    )
  );

drop policy "event_photos_message_photo_select" on storage.objects;
create policy "event_photos_message_photo_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos' and exists (
      select 1 from messages
      where messages.photo_url = storage.objects.name
        and (
          private.is_event_admin(messages.event_id)
          or (
            private.is_event_approved_participant(messages.event_id)
            and (
              (messages.channel = 'main' and not private.is_block_hidden_for_me(messages.event_id, 'chat'))
              or (messages.channel = 'backstage' and not private.is_block_hidden_for_me(messages.event_id, 'backstage'))
            )
          )
        )
    )
  );

-- ============================================================
-- c) Backfill : sans ca, tous les evenements DEJA crees perdraient
-- instantanement leur masquage cagnotte/Coulisses (l'ancienne regle codee
-- en dur disparait avec les policies ci-dessus, remplacee par la lecture
-- de ce tableau). Le chat general ('chat') N'EST PAS ajoute au backfill :
-- il n'a jamais ete masquable avant cette feature, donc aucun evenement
-- existant n'a besoin de le voir apparaitre masque par surprise -- les
-- nouveaux evenements partent de la case decochee par defaut (voir
-- CreateEventWizard.INITIAL_DATA), exactement comme bring/polls/playlist.
-- ============================================================
update events
set beneficiary_hidden_blocks = (
  select array_agg(distinct block)
  from unnest(beneficiary_hidden_blocks || array['pot', 'backstage']) as block
)
where not (beneficiary_hidden_blocks @> array['pot', 'backstage']);

-- ============================================================
-- Migration : 20260710002300_bring_units_and_realtime.sql
-- ============================================================
-- "Qui amene quoi" (brief 4.4, Phase 6) : le schema `bring_items`/`bring_claims`
-- existe depuis la Phase 1 (quantite en nombre entier, aucune unite), mais
-- aucune UI n'avait jamais ete construite dessus. Retour Thomas en validant
-- le plan : "l'organisateur doit pouvoir mettre lui-meme le nom (alcool,
-- dessert, soft, bonbon etc..) et pouvoir choisir litres, gramme, kilo ou
-- quantite" -- necessite une colonne d'unite et des quantites decimales
-- (ex. "1.5 L", "2.5 kg"), pas seulement des entiers.

alter table bring_items
  add column unit text not null default 'piece'
  check (unit in ('piece', 'liter', 'gram', 'kilogram'));

-- `quantity_needed`/`quantity` passent d'entier a numerique : aucune donnee
-- existante a convertir (fonctionnalite jamais utilisee jusqu'ici, aucune
-- vraie ligne en base), mais le type doit accepter les deux cas (un compte
-- de pieces ET une quantite en litres/kilos) des la premiere utilisation.
alter table bring_items
  alter column quantity_needed type numeric using quantity_needed::numeric;

alter table bring_claims
  alter column quantity type numeric using quantity::numeric;

-- Ni bring_items ni bring_claims n'etaient dans la publication Realtime
-- (regle transverse du projet : tout changement doit se refleter en direct
-- chez tout le monde, voir DECISIONS.md) -- necessaire pour que les jauges
-- "quantite recue / demandee" se mettent a jour sans F5 (Accueil ET
-- Participer).
alter publication supabase_realtime add table bring_items, bring_claims;

-- ============================================================
-- Migration : 20260710002400_bring_items_guest_proposals.sql
-- ============================================================
-- "Qui apporte quoi", suite (brief 4.4, retour Thomas) : "que penses-tu si
-- sur la page participer, tous les utilisateurs peuvent rajouter des
-- produits qui ne sont pas dans la liste ? avec une moderation par les
-- admins et/ou l'organisateur, avec une notif rouge sur participer comme
-- pour personnes ?" -- confirme ("go"). Jusqu'ici, `bring_items_write_admin`
-- (for all, admin uniquement) etait la SEULE policy d'ecriture : aucun
-- participant ne pouvait rien inserer.

alter table bring_items
  add column status text not null default 'approved' check (status in ('pending', 'approved'));

alter table bring_items
  add column proposed_by_rsvp_id uuid references rsvps(id) on delete set null;

-- Un non-admin ne voit desormais que les items APPROUVES (les 'pending'
-- restent invisibles pour tout le monde sauf l'admin qui doit les moderer) --
-- meme philosophie que la file d'attente RSVP.
drop policy "bring_items_select" on bring_items;
create policy "bring_items_select" on bring_items
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (
      private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'bring')
      and status = 'approved'
    )
  );

-- Nouveau : un participant approuve (non masque du bloc 'bring') peut
-- proposer un item, TOUJOURS en 'pending' et TOUJOURS associe a SA PROPRE
-- ligne rsvp -- jamais approuve directement par cette policy.
-- `bring_items_write_admin` (for all, inchangee) couvre deja l'approbation
-- (UPDATE status) et le refus (DELETE) d'un item, y compris 'pending'.
create policy "bring_items_propose_own" on bring_items
  for insert to authenticated
  with check (
    status = 'pending'
    and private.is_my_rsvp(proposed_by_rsvp_id)
    and private.is_event_approved_participant(event_id)
    and not private.is_block_hidden_for_me(event_id, 'bring')
  );

-- ============================================================
-- Migration : 20260710002500_bring_claims_admin_insert.sql
-- ============================================================
-- "Qui apporte quoi", suite (brief 4.4, retour Thomas) : "quand quelqu'un
-- demande pour rajouter un produit, c'est qu'il va ramener ça" -- a
-- l'approbation d'une proposition, une reclamation (bring_claims) doit
-- etre creee automatiquement pour le proposant (quantite qu'il avait
-- indiquee). Meme chose pour la fusion d'une proposition en double dans un
-- item existant ("l'admin doit pouvoir choisir... si quelqu'un a deja
-- propose ce produit").
--
-- Ces deux actions sont executees par l'ADMIN qui modere (pas par le
-- proposant lui-meme) : `bring_claims_write_own` (INSERT) n'autorisait
-- jusqu'ici que `is_my_rsvp(rsvp_id)` -- un admin inserant une claim POUR
-- QUELQU'UN D'AUTRE echouait donc. Elargie pour autoriser aussi un admin de
-- l'evenement, meme pattern deja en place pour `bring_claims_update`.

drop policy "bring_claims_write_own" on bring_claims;
create policy "bring_claims_write_own" on bring_claims
  for insert to authenticated
  with check (
    exists (
      select 1 from bring_items bi
      where bi.id = item_id
        and (
          private.is_event_admin(bi.event_id)
          or (
            private.is_my_rsvp(rsvp_id)
            and private.is_event_approved_participant(bi.event_id)
            and not private.is_block_hidden_for_me(bi.event_id, 'bring')
          )
        )
    )
  );

-- ============================================================
-- Migration : 20260710002600_clear_bring_claims_on_restricted.sql
-- ============================================================
-- Bug reel signale par Thomas : "j'ai un utilisateur qui a dit qu'il allait
-- ramener 3 litres de vodka, apres il a marque qu'il venait pas et pourtant
-- j'ai toujours son nom avec 3 litres de vodka."
--
-- `leave_or_remove_participant` supprime deja `bring_claims` quand un
-- participant quitte/est retire (voir participant_lifecycle.sql, "1.
-- Nettoyage des engagements"), mais `update_my_answer` (le chemin "Je ne
-- peux pas", answer='no' -> status='restricted') n'avait jamais ce meme
-- nettoyage -- un engagement pris avant restait affiche tel quel, laissant
-- croire a tort que la personne apportera quand meme l'item.
--
-- Retour Thomas, suite logique : une PROPOSITION encore en attente de
-- moderation ("qui apporte quoi") n'a de sens que parce que le proposant
-- comptait venir -- si son statut passe a restricted (via 'no'), la
-- proposition doit disparaitre elle aussi, pas juste sa reclamation sur un
-- item deja approuve. Un item deja APPROUVE (donc devenu un vrai besoin de
-- la fete, pas juste une suggestion personnelle) n'est en revanche jamais
-- supprime ici -- seul son propre engagement dessus l'est (ci-dessus).
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
    -- Meme principe que leave_or_remove_participant : les jauges se
    -- recalculent automatiquement par comptage des lignes restantes.
    delete from bring_claims where rsvp_id = p_rsvp_id;
    -- Propositions encore en attente de moderation : supprimees avec la
    -- meme logique (jamais les items DEJA approuves, devenus un besoin
    -- generique de la fete, independant de qui les a proposes a l'origine).
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
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

-- ============================================================
-- Migration : 20260711000100_polls_proposals_and_cleanup.sql
-- ============================================================
-- Sondages (brief : "Sondage(s) optionnel(s)", ecran 4 + onglet Participer).
-- `polls`/`poll_options`/`poll_votes` existent en base depuis la Phase 1,
-- jamais aucune UI jusqu'ici -- meme situation que "qui apporte quoi" avant
-- son propre chantier (20260710002400).
--
-- Retour Thomas : "les autres utilisateurs doivent pouvoir [proposer] un
-- sondage et doit etre accepter par les admins ou les organisateurs, la
-- meme organisation que pour qui rapporte quoi" -- meme statut
-- pending/approved, meme modele de proposition que bring_items.
alter table polls
  add column status text not null default 'approved' check (status in ('pending', 'approved'));

alter table polls
  add column proposed_by_rsvp_id uuid references rsvps(id) on delete set null;

-- Realtime (EventTabs.tsx, canal dedie event-{id}-polls) : ces 3 tables
-- n'etaient encore jamais ajoutees a la publication, meme etape que
-- bring_items/bring_claims (20260710002300_bring_units_and_realtime.sql).
alter publication supabase_realtime add table polls, poll_options, poll_votes;

-- Non-admin limite aux sondages approuves (+ masquage beneficiaire deja en
-- place) ; un admin voit tout, y compris en attente, pour pouvoir moderer.
-- Prefixe private. obligatoire ici : policy RECREEE, contrairement a
-- l'originale (creee avant le deplacement des fonctions RLS vers le schema
-- private, donc resolue a son OID -- piege deja rencontre deux fois ce
-- mois-ci, voir DECISIONS.md).
drop policy "polls_select" on polls;
create policy "polls_select" on polls
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (
      private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'polls')
      and status = 'approved'
    )
  );

-- Meme filtre applique aux options d'un sondage en attente : sinon un
-- non-admin verrait les options d'un sondage qu'il ne peut pas encore voir
-- via `polls_select`. Recreee pour la meme raison de prefixe.
drop policy "poll_options_select" on poll_options;
create policy "poll_options_select" on poll_options
  for select to authenticated
  using (
    exists (
      select 1 from polls p
      where p.id = poll_id
        and (
          private.is_event_admin(p.event_id)
          or (
            private.is_event_approved_participant(p.event_id)
            and not private.is_block_hidden_for_me(p.event_id, 'polls')
            and p.status = 'approved'
          )
        )
    )
  );

-- Un participant approuve (non masque du bloc 'polls') peut proposer un
-- sondage, TOUJOURS en 'pending', TOUJOURS avec son propre rsvp_id (jamais
-- approuve directement -- `polls_write_admin`/`update_admin`/`delete_admin`,
-- deja en place, restent seules maitresses du passage a 'approved' ou du
-- refus, aucun changement necessaire la-dessus).
create policy "polls_propose_own" on polls
  for insert to authenticated
  with check (
    status = 'pending'
    and private.is_my_rsvp(proposed_by_rsvp_id)
    and private.is_event_approved_participant(event_id)
    and not private.is_block_hidden_for_me(event_id, 'polls')
  );

-- Un sondage propose a besoin d'au moins 2 options des sa creation : le
-- proposant doit pouvoir inserer les options de SON PROPRE sondage encore
-- en attente (jamais celles d'un sondage deja approuve ou appartenant a
-- quelqu'un d'autre).
create policy "poll_options_propose_own" on poll_options
  for insert to authenticated
  with check (
    exists (
      select 1 from polls p
      where p.id = poll_id
        and p.status = 'pending'
        and private.is_my_rsvp(p.proposed_by_rsvp_id)
    )
  );

-- Retour Thomas : "le vote doit disparaitre si la personne part ou faire
-- disparaitre la demande en cours si l'utilisateur part avant que ce soit
-- active" -- confirme etendu aux DEUX cas (quitter/etre retire ET "Je ne
-- peux pas"), meme regle que le correctif bring_claims de ce matin
-- (20260710002600).
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
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
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

-- `poll_votes` etait deja nettoyee ici depuis la Phase 1 ; seule la
-- proposition de sondage en attente est nouvelle.
create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id into v_event_id from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'the organizer cannot leave or be removed, transfer the organization first';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  -- 1. Nettoyage des engagements (les jauges/ratios se recalculent automatiquement,
  --    puisqu'ils sont derives par comptage des lignes restantes)
  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  -- 2. Anonymisation de l'identite (les messages et pot_contributions restent, "Anonyme"
  --    via la jointure -- voir rsvps_public qui affichera first_name = null).
  --    profile_id N'EST PLUS nullifie (voir commentaire de migration ci-dessus) :
  --    le lien avec le compte reel reste pour permettre une reactivation propre
  --    si la personne revient un jour sur cet evenement.
  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    guest_code = null,
    updated_at = now()
  where id = p_rsvp_id;

  -- 3. La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

-- ============================================================
-- Migration : 20260711000200_polls_propose_own_visibility_fix.sql
-- ============================================================
-- Bug reel trouve en testant la proposition de sondage avec Thomas ("Une
-- erreur est survenue, reessaie." a chaque tentative). Cause exacte,
-- confirmee par un script de diagnostic reproduisant la vraie session de
-- l'invite testeur : `poll_options_propose_own` (migration precedente,
-- 20260711000100) verifie l'appartenance du sondage parent via une
-- SOUS-REQUETE ordinaire sur `polls` -- elle-meme filtree par la RLS de
-- `polls_select`, qui ne montre un sondage `pending` qu'a un admin, jamais
-- au proposant lui-meme. Un invite ne pouvait donc JAMAIS satisfaire cette
-- policy pour ses propres options, meme en proposant un sondage
-- parfaitement valide selon toutes les autres conditions (verifiees une
-- par une : is_my_rsvp, is_event_approved_participant et
-- is_block_hidden_for_me passaient tous individuellement).
--
-- Correctif : `polls_select` autorise desormais aussi le PROPOSANT a voir
-- SON PROPRE sondage en attente (jamais celui d'un autre invite). Cote UI,
-- rien ne change : `PollsListClient` ne rend la section moderation qu'a un
-- admin (`isAdmin && pendingPolls.length > 0`), donc la ligne reste
-- invisible a l'ecran pour le proposant -- seule la policy SQL en a
-- desormais besoin en interne. Le comportement voulu ("jamais visible
-- ailleurs qu'a un admin tant qu'il n'est pas traite", cote affichage) reste
-- intact.
drop policy "polls_select" on polls;
create policy "polls_select" on polls
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (
      private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'polls')
      and (status = 'approved' or private.is_my_rsvp(proposed_by_rsvp_id))
    )
  );

-- ============================================================
-- Migration : 20260711000300_jour_j_arrived_home.sql
-- ============================================================
-- Mode Jour J (brief 4.11). `rsvps.checked_in_at` existe deja depuis la
-- Phase 1 (deja accorde en ecriture a `authenticated`, deja couvert par
-- `rsvps_update_own`, deja synchronise dans `rsvps_public_data`) : aucun
-- changement necessaire pour l'arrivee elle-meme.
--
-- Retour Thomas, propose en cours de plan : "je suis bien rentre", symetrique
-- de "je suis arrive" pour la fin de soiree ("ca evite d'attendre un sms").
-- Contrairement au compteur d'arrivees (reserve aux admins, conforme au
-- brief), cette checklist est visible de TOUT LE MONDE ("chaque personne
-- coche sa case... et tout le monde le voit") -- reassurance collective,
-- pas un outil de logistique admin. Nouvelle colonne, aucune ne preexiste.
alter table rsvps add column arrived_home_at timestamptz;

-- Auto-service : le participant pose lui-meme ce champ sur SA ligne, comme
-- checked_in_at/wants_pot_access/answer... (rsvps_update_own couvre deja
-- "sa propre ligne", il ne manquait que le grant sur cette colonne precise).
grant update (arrived_home_at) on rsvps to authenticated;

-- Visible de TOUT LE MONDE (retour Thomas), pas seulement les admins :
-- ajoutee a la table miroir deja utilisee pour les infos partagees
-- (prenom, avatar... voir 20260706104902_replace_privacy_views_with_mirror_tables.sql).
alter table rsvps_public_data add column arrived_home_at timestamptz;

-- sync_rsvps_public_data() recreee pour inclure arrived_home_at, meme geste
-- que checked_in_at deja present dans cette fonction -- corps repris a
-- l'identique sinon.
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
    status, role, answer, is_designated_driver, checked_in_at, arrived_home_at, companions_count
  )
  values (
    new.id, new.event_id, new.first_name, left(new.last_name, 1), new.avatar_kind, new.avatar_value,
    new.status, new.role, new.answer, new.is_designated_driver, new.checked_in_at, new.arrived_home_at,
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
    arrived_home_at = excluded.arrived_home_at,
    companions_count = excluded.companions_count;

  return new;
end;
$$;

-- ============================================================
-- Migration : 20260712000100_checkin_answer_switch.sql
-- ============================================================
-- Mode Jour J, retour Thomas : "quand une personne dit je suis arrivé... il
-- doit passer de peut-être (s'il est sur peut-être) à je viens... s'il
-- reclique sur arrivé il reprend son ancien statut". Le check-in bascule
-- `answer` de 'maybe' à 'yes' (arriver, c'est forcément venir) ; annuler le
-- check-in doit restaurer la réponse d'origine, pas juste effacer
-- `checked_in_at` -- il faut donc se souvenir de cette réponse le temps du
-- check-in. Colonne interne (jamais exposée dans `rsvps_public_data`,
-- personne d'autre n'a besoin de la voir).
alter table rsvps add column answer_before_checkin text;

-- Auto-service, même principe que `checked_in_at`/`arrived_home_at`
-- (rsvps_update_own couvre déjà "sa propre ligne").
grant update (answer_before_checkin) on rsvps to authenticated;

-- ============================================================
-- Migration : 20260712000200_event_manual_end.sql
-- ============================================================
-- Bouton "Terminer" (brief 4.11, proposé par Thomas) : un admin/organisateur
-- peut clore manuellement le Mode Jour J plutôt que d'attendre la bascule
-- automatique du lendemain -- utile pour une fête qui se termine bien avant
-- minuit, ou à l'inverse pour ne PAS attendre le surlendemain sur un
-- événement qui traîne. `ended_at` prime sur le calcul de date dans
-- `isJourJ`/`isEventOver` (src/lib/event-status.ts).
--
-- Aucun grant dédié nécessaire : `events_update_by_admin` (migration
-- 20260706101047) autorise déjà un admin à modifier N'IMPORTE QUELLE colonne
-- de sa ligne événement (contrairement à `rsvps`, jamais restreint colonne
-- par colonne jusqu'ici).
alter table events add column ended_at timestamptz;

-- ============================================================
-- Migration : 20260712000300_event_reminders.sql
-- ============================================================
-- Relances et rappels (brief 4.7, Phase 6) : "relances des indécis à J-7 et
-- J-2, rappel des 'oui' à J-1 avec adresse, message post-événement à J+1".
-- Consentement JAMAIS pré-coché (brief section 9, RGPD) : opt-in explicite
-- par participant, colonne à part plutôt qu'une préférence globale au profil
-- (un même compte peut vouloir des rappels pour un événement et pas un
-- autre).
alter table rsvps add column wants_reminders boolean not null default false;

-- Auto-service, même pattern que `wants_pot_access`/`checked_in_at`
-- (`rsvps_update_own` couvre déjà "sa propre ligne").
grant update (wants_reminders) on rsvps to authenticated;

-- Idempotence du cron (brief : "Brevo + Vercel Cron", un passage par jour) :
-- une colonne par type de rappel, jamais renvoyé deux fois même si le cron
-- tourne plusieurs fois le même jour ou si l'événement est modifié entre
-- deux passages.
alter table rsvps add column reminder_j7_sent_at timestamptz;
alter table rsvps add column reminder_j2_sent_at timestamptz;
alter table rsvps add column reminder_j1_sent_at timestamptz;
alter table rsvps add column reminder_post_sent_at timestamptz;

-- Résout l'email réel (`auth.users`, jamais exposé via l'API REST classique)
-- des participants ayant consenti aux rappels pour un événement -- réservée
-- au cron de relances (service_role, contourne RLS), jamais accordée à
-- `authenticated` (même principe que `get_event_participants_account_type`,
-- migration 20260710002000, mais celle-ci reste interne au serveur, aucune
-- UI ne l'appelle jamais directement).
create or replace function get_reminder_recipients(p_event_id uuid)
returns table (
  rsvp_id uuid,
  email text,
  first_name text,
  answer text,
  reminder_j7_sent_at timestamptz,
  reminder_j2_sent_at timestamptz,
  reminder_j1_sent_at timestamptz,
  reminder_post_sent_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select r.id, u.email, r.first_name, r.answer,
         r.reminder_j7_sent_at, r.reminder_j2_sent_at, r.reminder_j1_sent_at, r.reminder_post_sent_at
  from rsvps r
  join auth.users u on u.id = r.profile_id
  where r.event_id = p_event_id
    and r.wants_reminders = true
    and r.status = 'approved'
    and u.email is not null;
$$;

grant execute on function get_reminder_recipients(uuid) to service_role;

-- ============================================================
-- Migration : 20260712000400_polls_choice_mode_and_quantity.sql
-- ============================================================
-- Sondages "choix unique" avec quota par personne (retour Thomas) : "je sais
-- voter pour les 3... j'ai le droit qu'à un menu" + "si j'ai des
-- accompagnants, je ne sais pas avoir 4 menus moules frites". Jusqu'ici tout
-- sondage était implicitement "choix multiple" et un vote valait toujours
-- pour 1 personne, quel que soit le nombre d'accompagnants du votant.
--
-- Approche retenue (choix explicite de Thomas parmi 3 options proposées) :
-- "quota par personne" -- un sondage 'single' donne à chaque rsvp un budget
-- de "1 + ses accompagnants" votes à répartir librement entre les options
-- (ex: 4 sur "moules-frites", ou 2+2 si le groupe se partage), via une
-- quantité par option plutôt qu'un modèle "un accompagnant nommé = une
-- ligne de vote" (plus simple, et la plupart des accompagnants n'ont même
-- pas de prénom renseigné). Un sondage 'multiple' garde le comportement
-- historique (cases à cocher, quantité toujours 1).

alter table polls
  add column choice_mode text not null default 'multiple' check (choice_mode in ('single', 'multiple'));

alter table poll_votes
  add column quantity int not null default 1 check (quantity > 0);

-- Toute la logique de quota vit ici (jamais côté client) : un client qui
-- mentirait sur la quantité se ferait de toute façon rejeter par cette
-- fonction, seul chemin d'écriture désormais utilisé par `setPollVote`
-- (actions/polls.ts) -- même principe que `update_my_answer`/
-- `create_own_rsvp`, la vraie règle métier est en SQL, pas en JS.
create or replace function set_poll_vote(p_rsvp_id uuid, p_option_id uuid, p_quantity int)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_poll_id uuid;
  v_choice_mode text;
  v_companions_count int;
  v_budget int;
  v_other_total int;
begin
  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select po.poll_id, p.choice_mode into v_poll_id, v_choice_mode
  from poll_options po
  join polls p on p.id = po.poll_id
  where po.id = p_option_id;

  if v_poll_id is null then
    raise exception 'invalid option';
  end if;

  if p_quantity <= 0 then
    delete from poll_votes where option_id = p_option_id and rsvp_id = p_rsvp_id;
    return;
  end if;

  if v_choice_mode = 'multiple' then
    if p_quantity <> 1 then
      raise exception 'invalid quantity for multiple choice poll';
    end if;
    insert into poll_votes (option_id, rsvp_id, quantity)
    values (p_option_id, p_rsvp_id, 1)
    on conflict (option_id, rsvp_id) do update set quantity = 1;
    return;
  end if;

  -- choix unique : quota partagé sur tout le sondage = 1 (le votant) + ses
  -- accompagnants, réparti librement entre les options de CE sondage.
  select count(*) into v_companions_count from companions where rsvp_id = p_rsvp_id;
  v_budget := 1 + v_companions_count;

  select coalesce(sum(pv.quantity), 0) into v_other_total
  from poll_votes pv
  join poll_options po on po.id = pv.option_id
  where po.poll_id = v_poll_id and pv.rsvp_id = p_rsvp_id and pv.option_id <> p_option_id;

  if v_other_total + p_quantity > v_budget then
    raise exception 'quota exceeded';
  end if;

  insert into poll_votes (option_id, rsvp_id, quantity)
  values (p_option_id, p_rsvp_id, p_quantity)
  on conflict (option_id, rsvp_id) do update set quantity = excluded.quantity;
end;
$$;

revoke execute on function set_poll_vote(uuid, uuid, int) from public, anon;
grant execute on function set_poll_vote(uuid, uuid, int) to authenticated;

-- ============================================================
-- Migration : 20260712000500_delete_own_account.sql
-- ============================================================
-- Suppression de compte en libre-service (retour Thomas : "on doit pouvoir
-- supprimer son compte, et effacer toutes les données... retirer toutes les
-- infos du profil, passer les messages dans le chat en anonyme, retirer le
-- vote dans les sondages, de qui apporte quoi avec les +1 compris"), brief
-- section 9 (RGPD, droit à l'effacement) + section 4.8.
--
-- Même logique d'anonymisation que `leave_or_remove_participant` (quitter un
-- SEUL événement), appliquée ici à TOUTES les participations du compte à la
-- fois : les messages de chat et `pot_contributions` ne sont jamais
-- supprimés (ils restent "Anonyme" via la jointure sur la ligne rsvps
-- anonymisée, déjà comment ce mécanisme fonctionne), mais `poll_votes`,
-- `bring_claims`, `companions` (les "+1") et les sondages/items proposés
-- encore en attente sont bien supprimés.
--
-- Différence clé avec `leave_or_remove_participant` : celle-ci laisse
-- `profile_id` intact (pour permettre une réactivation propre si la
-- personne revient un jour sur CET événement précis) -- ici, le compte
-- lui-même va disparaître, `profile_id` doit donc être nullifié partout,
-- sans quoi la contrainte de clé étrangère `rsvps.profile_id references
-- profiles(id)` empêcherait la suppression de la ligne `profiles`.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_rsvp record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Un organisateur ne peut pas supprimer son compte tant qu'il reste
  -- l'hôte d'un événement (même règle que "quitter/être retiré", mais
  -- appliquée à l'échelle du compte) : `events.host_id references
  -- profiles(id)` bloquerait de toute façon la suppression du profil, et
  -- transférer l'organisation en amont (déjà possible, `transfer_event_host`)
  -- évite de supprimer silencieusement l'événement d'autres participants.
  if exists (select 1 from events where host_id = v_uid) then
    raise exception 'still hosting events, transfer organization first';
  end if;

  for v_rsvp in
    select id from rsvps where profile_id = v_uid and status not in ('left', 'removed')
  loop
    delete from poll_votes where rsvp_id = v_rsvp.id;
    delete from polls where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from date_votes where rsvp_id = v_rsvp.id;
    delete from bring_claims where rsvp_id = v_rsvp.id;
    delete from bring_items where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from companions where rsvp_id = v_rsvp.id;
    delete from playlist_suggestions where rsvp_id = v_rsvp.id and added_to_playlist = false;

    update rsvps set
      is_anonymized = true,
      status = 'left',
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      guest_code = null,
      profile_id = null,
      updated_at = now()
    where id = v_rsvp.id;
  end loop;

  -- Participations déjà quittées/retirées avant cette suppression de compte
  -- (donc pas reprises par la boucle ci-dessus, déjà anonymisées) : leur
  -- `profile_id` avait volontairement été laissé intact par
  -- `leave_or_remove_participant` -- il doit l'être ici aussi, sans quoi la
  -- suppression du profil échouerait sur la contrainte de clé étrangère.
  update rsvps set profile_id = null where profile_id = v_uid;

  -- Autres références directes à `profiles(id)` qui bloqueraient sinon la
  -- suppression du profil : une approbation passée sur la participation de
  -- quelqu'un d'autre, ou un rôle de bénéficiaire de cagnotte désigné.
  update rsvps set approved_by = null where approved_by = v_uid;
  update events set pot_owner = null where pot_owner = v_uid;
end;
$$;

revoke execute on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;

-- ============================================================
-- Migration : 20260713000100_remove_anonymous_sessions.sql
-- ============================================================
-- Retrait des sessions anonymes (retour Thomas) : "un compte anonyme c'est
-- trop de problème, impossible de ravoir le code si on a oublié... que les
-- gens se connectent à leur compte directement". Décision explicite après
-- discussion (Google OAuth ~15 secondes, l'argument friction ne tient pas) :
-- tout le monde doit désormais se connecter (Google ou e-mail) pour
-- participer à un événement. La RLS elle-même n'a rien à changer (toutes
-- les policies accordent au rôle générique `authenticated`, qu'une session
-- anonyme porte aussi) -- seules les fonctions ci-dessous, propres au
-- système de code de récupération et au badge "vrai compte", disparaissent.

-- `create_own_rsvp` : plus de génération/retour de guest_code. Le type de
-- retour change (table(rsvp_id, guest_code) -> uuid) : `create or replace`
-- refuse ça (42P13, "cannot change return type of existing function"), il
-- faut dropper explicitement l'ancienne signature d'abord.
drop function if exists create_own_rsvp(uuid, text, text, text, text, text, text, text);

create function create_own_rsvp(
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
begin
  select id, status into v_existing_id, v_existing_status
  from rsvps
  where event_id = p_event_id and profile_id = (select auth.uid());

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

-- `drop function` efface aussi les privilèges de l'ancienne fonction : à
-- réappliquer explicitement (même règle qu'à l'origine, sans quoi PUBLIC/anon
-- récupèrent le droit d'exécuter par défaut).
revoke execute on function create_own_rsvp(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function create_own_rsvp(uuid, text, text, text, text, text, text, text) to authenticated;

drop function if exists redeem_guest_code(text);
drop function if exists generate_guest_code();

alter table rsvps drop column if exists guest_code;

-- Un admin en session anonyme ne peut plus exister : le garde-fou anti-
-- transfert vers un tel admin n'a plus de raison d'être.
create or replace function transfer_event_host(p_event_id uuid, p_new_host_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_new_host_status text;
  v_new_host_role text;
begin
  if not is_event_host(p_event_id) then
    raise exception 'not authorized';
  end if;

  select status, role into v_new_host_status, v_new_host_role
  from rsvps
  where event_id = p_event_id and profile_id = p_new_host_profile_id;

  if v_new_host_status is distinct from 'approved' or v_new_host_role <> 'admin' then
    raise exception 'new host must be an approved admin';
  end if;

  update events set host_id = p_new_host_profile_id where id = p_event_id;
end;
$$;

-- N'existait que pour afficher le badge "vrai compte"/désactiver le
-- transfert d'organisation vers un admin anonyme, dans l'onglet Personnes.
drop function if exists get_event_participants_account_type(uuid);

-- `leave_or_remove_participant` et `delete_own_account` mettaient toutes
-- deux `guest_code = null` dans leur anonymisation -- colonne supprimée
-- ci-dessus, ces deux fonctions doivent être redéfinies sans cette ligne
-- (sans quoi le premier appel après cette migration échouerait : colonne
-- inexistante).
create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id into v_event_id from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'the organizer cannot leave or be removed, transfer the organization first';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    updated_at = now()
  where id = p_rsvp_id;

  -- La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_rsvp record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from events where host_id = v_uid) then
    raise exception 'still hosting events, transfer organization first';
  end if;

  for v_rsvp in
    select id from rsvps where profile_id = v_uid and status not in ('left', 'removed')
  loop
    delete from poll_votes where rsvp_id = v_rsvp.id;
    delete from polls where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from date_votes where rsvp_id = v_rsvp.id;
    delete from bring_claims where rsvp_id = v_rsvp.id;
    delete from bring_items where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from companions where rsvp_id = v_rsvp.id;
    delete from playlist_suggestions where rsvp_id = v_rsvp.id and added_to_playlist = false;

    update rsvps set
      is_anonymized = true,
      status = 'left',
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      profile_id = null,
      updated_at = now()
    where id = v_rsvp.id;
  end loop;

  update rsvps set profile_id = null where profile_id = v_uid;
  update rsvps set approved_by = null where approved_by = v_uid;
  update events set pot_owner = null where pot_owner = v_uid;
end;
$$;

-- ============================================================
-- Migration : 20260713000200_restricted_full_cleanup.sql
-- ============================================================
-- Retour Thomas : "être certain que si quelqu'un dit qu'il ne participe pas
-- à l'event ou le quitte, que toutes les choses qu'il apporte, les sondages
-- de lui et ses +1 disparaîtront et que le chat viendra avec un nom anonyme
-- avec une photo de profil anonyme." `leave_or_remove_participant` faisait
-- déjà tout ça ; `update_my_answer` (chemin "Je ne peux pas") ne retirait
-- que poll_votes/bring_claims/propositions en attente, jamais les
-- accompagnants, et n'anonymisait jamais l'identité (donc le chat gardait
-- le vrai nom). Alignée ici sur le même comportement, à une différence
-- près : "Je ne peux pas" reste RÉVERSIBLE (on peut revenir sur "je viens"),
-- contrairement à quitter -- l'identité est donc restaurée depuis `profiles`
-- (tenue à jour à chaque RSVP, voir `submitRsvp`) plutôt que redemandée.
create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
  v_profile_id uuid;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status, profile_id into v_status, v_profile_id from rsvps where id = p_rsvp_id;

  if p_answer = 'no' then
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from companions where rsvp_id = p_rsvp_id;
    delete from date_votes where rsvp_id = p_rsvp_id;
    delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

    update rsvps set
      answer = p_answer,
      status = 'restricted',
      is_anonymized = true,
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      updated_at = now()
    where id = p_rsvp_id;
  elsif v_status = 'restricted' then
    -- Retour sur "je viens"/"peut-être" : identité reprise depuis `profiles`
    -- (jamais touchée par l'anonymisation ci-dessus), pour ne pas obliger un
    -- nouveau formulaire complet à chaque changement d'avis.
    update rsvps r set
      answer = p_answer,
      status = 'pending',
      is_anonymized = false,
      first_name = p.first_name,
      last_name = p.last_name,
      phone = p.phone,
      avatar_kind = p.avatar_kind,
      avatar_value = p.avatar_value,
      wants_pot_access = false,
      pot_access_granted = false,
      updated_at = now()
    from profiles p
    where r.id = p_rsvp_id and p.id = v_profile_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

-- ============================================================
-- Migration : 20260713000300_reminder_preference.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260713000400_push_notifications.sql
-- ============================================================
-- Notifications push (Web Push) : abonnements navigateur + préférences par
-- catégorie. Retour Thomas : couverture large (réponses/invitations, chat,
-- organisation, jour J), chaque catégorie cochée par défaut mais
-- désactivable individuellement -- SAUF l'annulation d'événement, jamais
-- désactivable (trop important pour être raté), qui n'a donc pas de colonne
-- de préférence dédiée : elle part dès qu'un abonnement existe.

-- ============================================================
-- push_subscriptions
-- ============================================================
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- Un utilisateur gère ses propres abonnements (un par appareil/navigateur) ;
-- l'envoi lui-même se fait toujours via service_role (voir src/lib/push-send.ts),
-- jamais depuis le client -- même principe que companions/chat_reads (pas de
-- grant explicite nécessaire, RLS + rôle authenticated suffisent).
create policy "push_subscriptions_own" on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- profiles : préférences par catégorie
-- ============================================================
alter table profiles add column if not exists push_notif_invitations boolean not null default true;
alter table profiles add column if not exists push_notif_chat boolean not null default true;
alter table profiles add column if not exists push_notif_organisation boolean not null default true;
alter table profiles add column if not exists push_notif_jourj boolean not null default true;

-- `profiles` restreint les colonnes modifiables par le client (voir
-- rls_policies.sql) -- ces 4 colonnes n'ont aucune cascade ni validation
-- particulière (contrairement à wants_reminders/update_reminder_preference),
-- un simple grant column-level suffit, pas besoin de fonction dédiée.
grant update (push_notif_invitations, push_notif_chat, push_notif_organisation, push_notif_jourj)
  on profiles to authenticated;

-- ============================================================
-- reminder_*_sent_at : la migration 20260712000300 les créait sans
-- `if not exists` et n'a apparemment jamais été appliquée en base (erreur
-- "column r.reminder_j7_sent_at does not exist" en écrivant celle-ci) --
-- recréées ici de façon idempotente pour ne plus dépendre de cet état,
-- + la nouvelle colonne pour "C'est le Jour J" (diffDays === 0).
-- ============================================================
alter table rsvps add column if not exists reminder_j7_sent_at timestamptz;
alter table rsvps add column if not exists reminder_j2_sent_at timestamptz;
alter table rsvps add column if not exists reminder_j1_sent_at timestamptz;
alter table rsvps add column if not exists reminder_post_sent_at timestamptz;
alter table rsvps add column if not exists reminder_jourj_sent_at timestamptz;

-- ============================================================
-- get_reminder_recipients : ajout de profile_id (ciblage des push depuis le cron)
-- ============================================================
-- `create or replace` ne peut pas changer la forme du retour (piège déjà
-- rencontré ce chantier, erreur 42P13) -- drop explicite nécessaire.
drop function if exists get_reminder_recipients(uuid);

create function get_reminder_recipients(p_event_id uuid)
returns table (
  rsvp_id uuid,
  profile_id uuid,
  email text,
  first_name text,
  answer text,
  reminder_j7_sent_at timestamptz,
  reminder_j2_sent_at timestamptz,
  reminder_j1_sent_at timestamptz,
  reminder_post_sent_at timestamptz,
  reminder_jourj_sent_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select r.id, r.profile_id, u.email, r.first_name, r.answer,
         r.reminder_j7_sent_at, r.reminder_j2_sent_at, r.reminder_j1_sent_at, r.reminder_post_sent_at,
         r.reminder_jourj_sent_at
  from rsvps r
  join auth.users u on u.id = r.profile_id
  where r.event_id = p_event_id
    and r.wants_reminders = true
    and r.status = 'approved'
    and u.email is not null;
$$;

grant execute on function get_reminder_recipients(uuid) to service_role;

-- ============================================================
-- Migration : 20260713000500_fix_delete_own_account_guest_code.sql
-- ============================================================
-- Bug réel trouvé en lançant la suite e2e complète : la suppression de
-- compte échouait systématiquement ("column guest_code of relation rsvps
-- does not exist"). `delete_own_account` était censée avoir été redéfinie
-- sans cette colonne par la migration 20260713000100 (retrait des sessions
-- anonymes, colonne supprimée dans la même migration) -- mais la version
-- réellement active en base était encore celle de 20260712000500 (sa toute
-- première création, qui référence encore `guest_code`). `create or
-- replace` ici pour forcer la bonne version, quelle que soit l'état actuel.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_rsvp record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from events where host_id = v_uid) then
    raise exception 'still hosting events, transfer organization first';
  end if;

  for v_rsvp in
    select id from rsvps where profile_id = v_uid and status not in ('left', 'removed')
  loop
    delete from poll_votes where rsvp_id = v_rsvp.id;
    delete from polls where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from date_votes where rsvp_id = v_rsvp.id;
    delete from bring_claims where rsvp_id = v_rsvp.id;
    delete from bring_items where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from companions where rsvp_id = v_rsvp.id;
    delete from playlist_suggestions where rsvp_id = v_rsvp.id and added_to_playlist = false;

    update rsvps set
      is_anonymized = true,
      status = 'left',
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      profile_id = null,
      updated_at = now()
    where id = v_rsvp.id;
  end loop;

  update rsvps set profile_id = null where profile_id = v_uid;
  update rsvps set approved_by = null where approved_by = v_uid;
  update events set pot_owner = null where pot_owner = v_uid;
end;
$$;

-- ============================================================
-- Migration : 20260713000600_security_advisor_fixes.sql
-- ============================================================
-- Corrections suite à l'Advisor Sécurité de Supabase (19 warnings signalés
-- par Thomas). La plupart des warnings "SECURITY DEFINER callable par
-- authenticated" sont volontaires (chaque fonction vérifie elle-même les
-- droits de l'appelant en interne -- c'est tout le principe de ce projet :
-- le client n'écrit jamais status/role/approbation directement, voir
-- rls_policies.sql) : rien à corriger pour celles-là. Deux vrais problèmes
-- trouvés en revérifiant chacune en détail :

-- 1. `get_reminder_recipients` : fuite de PII réelle. Ni la migration
--    d'origine (20260712000300) ni sa redéfinition (20260713000400) n'ont
--    jamais fait de `revoke` avant le `grant ... to service_role` -- par
--    défaut Postgres accorde EXECUTE à PUBLIC sur toute fonction créée, donc
--    `anon` ET `authenticated` pouvaient appeler
--    `/rest/v1/rpc/get_reminder_recipients` avec n'importe quel `event_id`
--    et récupérer emails/prénoms de tous les participants -- cette fonction
--    ne vérifie AUCUNE identité de l'appelant (elle n'est censée être
--    appelée que par le cron via service_role).
revoke execute on function get_reminder_recipients(uuid) from public, anon, authenticated;
grant execute on function get_reminder_recipients(uuid) to service_role;

-- 2. `transfer_event_host` : même oubli depuis sa toute première migration
--    (20260710001900, `grant ... to authenticated` sans `revoke` avant) --
--    resté tel quel à travers toutes ses redéfinitions (`create or replace`
--    préserve les grants existants). `anon` pouvait donc l'appeler --
--    protégée en pratique par `is_event_host()` (auth.uid() est toujours
--    null pour anon, donc rejet), mais à corriger par principe, même
--    hygiène que create_own_rsvp/create_own_rsvp.
revoke execute on function transfer_event_host(uuid, uuid) from public, anon;
grant execute on function transfer_event_host(uuid, uuid) to authenticated;

-- 3. Table `waitlist` : reste de la landing "pré-lancement" (Phase 2),
--    entièrement retirée du code cette session (retour Thomas : plus une
--    page de pré-lancement mais une vraie vitrine). Sa policy INSERT
--    (`WITH CHECK (true)`) est signalée par l'Advisor comme trop permissive
--    -- sans objet, la table elle-même n'est plus utilisée : supprimée
--    entièrement plutôt que corrigée. Contenait une seule ligne, un résidu
--    d'e2e (`e2e-waitlist-...@example.com`, pas une vraie inscription).
drop table if exists waitlist;

-- ============================================================
-- Migration : 20260713000700_push_subscriptions_rls_perf.sql
-- ============================================================
-- Performance Advisor : `push_subscriptions_own` utilisait `auth.uid()` brut
-- au lieu de `(select auth.uid())` -- le reste du projet a déjà cette
-- convention partout (voir 20260706110035_performance_advisor_fixes_2.sql,
-- même correctif) car Postgres réévalue `auth.uid()` à CHAQUE ligne sinon,
-- alors que la sous-requête scalaire n'est évaluée qu'une seule fois par
-- requête -- oubli de ma part en écrivant cette policy hier soir.
drop policy if exists "push_subscriptions_own" on push_subscriptions;

create policy "push_subscriptions_own" on push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ============================================================
-- Migration : 20260713000800_missing_fk_indexes.sql
-- ============================================================
-- Performance Advisor (INFO) : deux clés étrangères sans index couvrant,
-- utilisées pour retrouver "mes propositions en attente" (qui apporte quoi
-- + sondages) -- ajout simple et sans risque, aucun changement de
-- comportement.
create index if not exists bring_items_proposed_by_rsvp_id_idx on bring_items(proposed_by_rsvp_id);
create index if not exists polls_proposed_by_rsvp_id_idx on polls(proposed_by_rsvp_id);

-- ============================================================
-- Migration : 20260714000100_pot_payments.sql
-- ============================================================
-- Phase 7 (cagnotte) : partie paiement réelle. Le squelette (schéma/RLS/
-- wizard/accès "cagnotte seule") existe déjà depuis la Phase 1 -- cette
-- migration ajoute uniquement ce qui manquait pour brancher Stripe Connect
-- Express dessus (onboarding, Checkout, webhooks, fermeture automatique).

-- ============================================================
-- pot_contributions : traçabilité de la session Checkout + statuts manquants
-- ============================================================
alter table pot_contributions add column if not exists stripe_checkout_session_id text unique;
alter table pot_contributions add column if not exists updated_at timestamptz not null default now();

alter table pot_contributions drop constraint if exists pot_contributions_status_check;
alter table pot_contributions add constraint pot_contributions_status_check
  check (status in ('pending', 'succeeded', 'failed', 'canceled'));

-- ============================================================
-- profiles : statut d'onboarding Stripe Connect (évite de réinterroger
-- l'API Stripe à chaque affichage pour savoir si l'organisateur peut
-- recevoir des paiements -- synchronisé par le webhook `account.updated`)
-- ============================================================
alter table profiles add column if not exists stripe_onboarding_complete boolean not null default false;

-- ============================================================
-- events : fermeture de la cagnotte (pot_close_at_goal, une fois l'objectif
-- atteint) -- distinct de pot_enabled : une cagnotte fermée reste
-- consultable (historique des contributions), juste plus de nouvelle
-- contribution possible. Réversible par un admin comme le reste du projet.
-- ============================================================
alter table events add column if not exists pot_closed_at timestamptz;

-- ============================================================
-- Transfert de la cagnotte (brief 4.8) : l'admin qui la porte (pot_owner)
-- change de main -- security definer, même pattern que
-- transfer_event_host. Ne touche jamais stripe_onboarding_complete : c'est
-- un statut par PROFIL (un compte Stripe Connect par utilisateur), pas par
-- événement -- si le nouveau porteur a déjà un compte Stripe fonctionnel
-- (porte déjà la cagnotte d'un autre événement), inutile de refaire
-- l'onboarding.
create function transfer_pot_ownership(p_event_id uuid, p_new_owner_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_new_owner_status text;
  v_new_owner_role text;
begin
  if not is_event_admin(p_event_id) then
    raise exception 'not authorized';
  end if;

  select status, role into v_new_owner_status, v_new_owner_role
  from rsvps
  where event_id = p_event_id and profile_id = p_new_owner_profile_id;

  if v_new_owner_status is distinct from 'approved' or v_new_owner_role not in ('admin') then
    if not exists (select 1 from events where id = p_event_id and host_id = p_new_owner_profile_id) then
      raise exception 'new pot owner must be an approved admin or the organizer';
    end if;
  end if;

  update events set pot_owner = p_new_owner_profile_id where id = p_event_id;
end;
$$;

revoke execute on function transfer_pot_ownership(uuid, uuid) from public, anon;
grant execute on function transfer_pot_ownership(uuid, uuid) to authenticated;

-- ============================================================
-- Garde-fou suppression de compte (brief 4.8) : `delete_own_account`
-- vidait déjà silencieusement `pot_owner` en toute fin de fonction (ligne
-- "update events set pot_owner = null where pot_owner = v_uid"), SANS
-- jamais vérifier qu'aucune cagnotte active n'en dépendait -- une cagnotte
-- ouverte se serait retrouvée orpheline, plus aucune contribution ne
-- pouvant être routée. Bloqué désormais tant qu'une cagnotte ACTIVE
-- (pot_enabled ET pas encore fermée) dépend de ce compte -- message clair
-- côté action serveur, cohérent avec le blocage "encore organisateur" déjà
-- en place juste au-dessus. Le solde Stripe réel (autre condition du
-- brief : "et solde Stripe à zéro") ne peut pas être vérifié en SQL pur --
-- cette vérification-là se fait côté action serveur (appel API Stripe)
-- AVANT d'appeler cette fonction, jamais dans le RPC lui-même.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_rsvp record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from events where host_id = v_uid) then
    raise exception 'still hosting events, transfer organization first';
  end if;

  if exists (
    select 1 from events
    where pot_owner = v_uid and pot_enabled = true and pot_closed_at is null
  ) then
    raise exception 'still owns an active pot, transfer or close it first';
  end if;

  for v_rsvp in
    select id from rsvps where profile_id = v_uid and status not in ('left', 'removed')
  loop
    delete from poll_votes where rsvp_id = v_rsvp.id;
    delete from polls where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from date_votes where rsvp_id = v_rsvp.id;
    delete from bring_claims where rsvp_id = v_rsvp.id;
    delete from bring_items where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from companions where rsvp_id = v_rsvp.id;
    delete from playlist_suggestions where rsvp_id = v_rsvp.id and added_to_playlist = false;

    update rsvps set
      is_anonymized = true,
      status = 'left',
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      profile_id = null,
      updated_at = now()
    where id = v_rsvp.id;
  end loop;

  update rsvps set profile_id = null where profile_id = v_uid;
  update rsvps set approved_by = null where approved_by = v_uid;
  -- Sans risque ici : le garde-fou plus haut a déjà bloqué toute cagnotte
  -- encore ACTIVE -- une référence `pot_owner` restante à ce stade ne peut
  -- venir que d'une cagnotte déjà fermée, sans lien de routage à préserver.
  update events set pot_owner = null where pot_owner = v_uid;
end;
$$;

-- ============================================================
-- Migration : 20260714000200_pot_contributions_realtime.sql
-- ============================================================
-- Bug réel signalé par Thomas ("pas de refresh automatiquement sur mon
-- site") : contrairement à bring_items/polls/rsvps, `pot_contributions` et
-- `pot_payouts` n'avaient jamais été ajoutées à la publication Realtime --
-- le webhook Stripe met bien la ligne à jour en base, mais personne ne le
-- voit sans rafraîchir la page manuellement. Même pattern que les autres
-- tables (voir 20260710002300_bring_units_and_realtime.sql).
alter publication supabase_realtime add table pot_contributions, pot_payouts;

-- ============================================================
-- Migration : 20260714000300_pot_owner_cannot_leave_active_pot.sql
-- ============================================================
-- Retour Thomas : "si la personne qui a la cagnotte quitte... comment elle
-- va avoir le pdf avec les infos ?" -- répondre "je ne peux pas" (statut
-- restricted) ou quitter l'événement font tous deux perdre le statut admin
-- approuvé (donc l'accès au tableau de bord ET à l'export PDF), alors même
-- que cette personne continue de recevoir l'argent des nouvelles
-- contributions en coulisses (stripe_account_id n'est jamais touché par ces
-- deux fonctions).
--
-- Décision finale après discussion avec Thomas :
-- - "Quitter l'événement" reste BLOQUÉ tant qu'on porte une cagnotte encore
--   active (même garde-fou que `delete_own_account`) -- cette action
--   anonymise et retire complètement, incompatible avec rester responsable
--   de l'argent.
-- - "Je ne peux pas" (répondre "no"), en revanche, doit rester LIBRE pour
--   l'organisateur ou le porteur de cagnotte -- juste sans jamais perdre son
--   statut admin approuvé (jamais anonymisé, jamais rétrogradé en
--   "restricted") : il disparaît simplement de la liste des présents
--   ("Je viens"/"Peut-être", voir le filtre `approvedYes` de
--   `ParticipantsList.tsx`), tout en restant admin invisible dans l'event.

create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
  v_profile_id uuid;
  v_event_id uuid;
  v_keep_visible_admin boolean;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status, profile_id, event_id into v_status, v_profile_id, v_event_id from rsvps where id = p_rsvp_id;

  -- Organisateur (host_id) OU porteur d'une cagnotte encore active : garde
  -- son statut admin approuvé tel quel, même en répondant "je ne peux pas".
  v_keep_visible_admin := exists (
    select 1 from events
    where id = v_event_id
      and (host_id = v_profile_id or (pot_owner = v_profile_id and pot_enabled = true and pot_closed_at is null))
  );

  if p_answer = 'no' and v_keep_visible_admin then
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  elsif p_answer = 'no' then
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from companions where rsvp_id = p_rsvp_id;
    delete from date_votes where rsvp_id = p_rsvp_id;
    delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

    update rsvps set
      answer = p_answer,
      status = 'restricted',
      is_anonymized = true,
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      updated_at = now()
    where id = p_rsvp_id;
  elsif v_status = 'restricted' then
    update rsvps r set
      answer = p_answer,
      status = 'pending',
      is_anonymized = false,
      first_name = p.first_name,
      last_name = p.last_name,
      phone = p.phone,
      avatar_kind = p.avatar_kind,
      avatar_value = p.avatar_value,
      wants_pot_access = false,
      pot_access_granted = false,
      updated_at = now()
    from profiles p
    where r.id = p_rsvp_id and p.id = v_profile_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_profile_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id, profile_id into v_event_id, v_profile_id from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'the organizer cannot leave or be removed, transfer the organization first';
  end if;

  if exists (
    select 1 from events
    where id = v_event_id and pot_owner = v_profile_id and pot_enabled = true and pot_closed_at is null
  ) then
    raise exception 'still owns an active pot, transfer or close it first';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    updated_at = now()
  where id = p_rsvp_id;

  -- La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

-- ============================================================
-- Migration : 20260714000400_pot_owner_no_answer_cleanup.sql
-- ============================================================
-- Retour Thomas : "si je dis que je ne viens pas et que j'ai des +1, les
-- votes restent quand même... à apporter aussi ne se retire pas" -- la
-- branche "reste admin invisible" (organisateur/porteur de cagnotte
-- répondant "non") de la migration précédente ne faisait QUE changer
-- `answer`, en oubliant le nettoyage des engagements (votes, qui-apporte-
-- quoi, accompagnants, sondage de dates, playlist) que fait déjà la branche
-- normale juste en dessous. Ce nettoyage n'a rien à voir avec le statut/
-- l'anonymisation (qu'on ne touche toujours pas ici) -- il doit s'appliquer
-- de la même façon, peu importe qui répond "non".
create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
  v_profile_id uuid;
  v_event_id uuid;
  v_keep_visible_admin boolean;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status, profile_id, event_id into v_status, v_profile_id, v_event_id from rsvps where id = p_rsvp_id;

  v_keep_visible_admin := exists (
    select 1 from events
    where id = v_event_id
      and (host_id = v_profile_id or (pot_owner = v_profile_id and pot_enabled = true and pot_closed_at is null))
  );

  if p_answer = 'no' and v_keep_visible_admin then
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from companions where rsvp_id = p_rsvp_id;
    delete from date_votes where rsvp_id = p_rsvp_id;
    delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  elsif p_answer = 'no' then
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from companions where rsvp_id = p_rsvp_id;
    delete from date_votes where rsvp_id = p_rsvp_id;
    delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

    update rsvps set
      answer = p_answer,
      status = 'restricted',
      is_anonymized = true,
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      updated_at = now()
    where id = p_rsvp_id;
  elsif v_status = 'restricted' then
    update rsvps r set
      answer = p_answer,
      status = 'pending',
      is_anonymized = false,
      first_name = p.first_name,
      last_name = p.last_name,
      phone = p.phone,
      avatar_kind = p.avatar_kind,
      avatar_value = p.avatar_value,
      wants_pot_access = false,
      pot_access_granted = false,
      updated_at = now()
    from profiles p
    where r.id = p_rsvp_id and p.id = v_profile_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

-- ============================================================
-- Migration : 20260714000500_restricted_pot_access_payment.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260714000600_chat_system_messages_frozen_names.sql
-- ============================================================
-- Retour Thomas : "je vois Julie Dean a rejoint la fête, mais si Julie
-- quitte, ça va être marqué Anonyme a rejoint la fête à la place de Julie...
-- je veux juste 1x elle a rejoint et si elle quitte X a quitté, et si elle
-- revient plus tard, X a rejoint etc." -- le message "a rejoint" (seul type
-- de message système qui existait) résout le prénom EN DIRECT via rsvp_id
-- (voir commentaire de `admin_approve_rsvp`, chat_phase5.sql) : un choix
-- volontaire à l'époque (pour que revenir après un départ restaure le nom
-- sur les VRAIS messages déjà postés), mais qui casse spécifiquement les
-- messages système : eux représentent un événement figé dans le temps
-- ("X a rejoint CE jour-là"), pas une identité qui doit rester à jour.
--
-- Fix : le nom est désormais figé dans le message lui-même au moment de sa
-- création (jamais recalculé après), et un vrai message "left" apparaît
-- symétriquement au départ (répondre "non" OU quitter l'événement).

alter table messages add column if not exists system_author_name text;

-- ============================================================
-- admin_approve_rsvp : fige le prénom+nom dans le message "joined"
-- ============================================================
create or replace function admin_approve_rsvp(p_rsvp_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_status text;
  v_first_name text;
  v_last_name text;
begin
  if p_role not in ('guest', 'beneficiary') then
    raise exception 'invalid role: %', p_role;
  end if;

  select event_id, status, first_name, last_name
  into v_event_id, v_status, v_first_name, v_last_name
  from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if not is_event_admin(v_event_id) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'pending' then
    raise exception 'invalid status transition from %', v_status;
  end if;

  update rsvps set
    status = 'approved',
    role = p_role,
    approved_by = (select auth.uid()),
    approved_at = now(),
    updated_at = now()
  where id = p_rsvp_id;

  insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
  values (v_event_id, p_rsvp_id, 'main', true, 'joined', trim(concat_ws(' ', v_first_name, v_last_name)));
end;
$$;

-- ============================================================
-- update_my_answer : message "left" figé AVANT anonymisation (les 2
-- branches "non", "reste admin invisible" et normale)
-- ============================================================
create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
  v_profile_id uuid;
  v_event_id uuid;
  v_first_name text;
  v_last_name text;
  v_keep_visible_admin boolean;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status, profile_id, event_id, first_name, last_name
  into v_status, v_profile_id, v_event_id, v_first_name, v_last_name
  from rsvps where id = p_rsvp_id;

  v_keep_visible_admin := exists (
    select 1 from events
    where id = v_event_id
      and (host_id = v_profile_id or (pot_owner = v_profile_id and pot_enabled = true and pot_closed_at is null))
  );

  if p_answer = 'no' and v_keep_visible_admin then
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from companions where rsvp_id = p_rsvp_id;
    delete from date_votes where rsvp_id = p_rsvp_id;
    delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;

    insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
    values (v_event_id, p_rsvp_id, 'main', true, 'left', trim(concat_ws(' ', v_first_name, v_last_name)));
  elsif p_answer = 'no' then
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from companions where rsvp_id = p_rsvp_id;
    delete from date_votes where rsvp_id = p_rsvp_id;
    delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

    update rsvps set
      answer = p_answer,
      status = 'restricted',
      is_anonymized = true,
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      updated_at = now()
    where id = p_rsvp_id;

    insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
    values (v_event_id, p_rsvp_id, 'main', true, 'left', trim(concat_ws(' ', v_first_name, v_last_name)));
  elsif v_status = 'restricted' then
    update rsvps r set
      answer = p_answer,
      status = 'pending',
      is_anonymized = false,
      first_name = p.first_name,
      last_name = p.last_name,
      phone = p.phone,
      avatar_kind = p.avatar_kind,
      avatar_value = p.avatar_value,
      wants_pot_access = false,
      pot_access_granted = false,
      updated_at = now()
    from profiles p
    where r.id = p_rsvp_id and p.id = v_profile_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

-- ============================================================
-- leave_or_remove_participant : même message "left" figé
-- ============================================================
create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_profile_id uuid;
  v_first_name text;
  v_last_name text;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id, profile_id, first_name, last_name
  into v_event_id, v_profile_id, v_first_name, v_last_name
  from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'the organizer cannot leave or be removed, transfer the organization first';
  end if;

  if exists (
    select 1 from events
    where id = v_event_id and pot_owner = v_profile_id and pot_enabled = true and pot_closed_at is null
  ) then
    raise exception 'still owns an active pot, transfer or close it first';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    updated_at = now()
  where id = p_rsvp_id;

  insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
  values (v_event_id, p_rsvp_id, 'main', true, 'left', trim(concat_ws(' ', v_first_name, v_last_name)));

  -- La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;

-- ============================================================
-- Migration : 20260715000100_restaurant_polls.sql
-- ============================================================
-- Sondage resto (brief 4.6, V1.1) : un sondage peut désormais être alimenté
-- par de vrais restaurants (Google Places) au lieu d'options 100% manuelles,
-- avec un lien d'affiliation TheFork (Awin) par option. `kind` ne sert qu'à
-- adapter l'UI du wizard (options peuplées vs texte libre) -- aucune règle
-- métier ne change côté vote/quota, `set_poll_vote` reste inchangée.
alter table polls
  add column kind text not null default 'custom' check (kind in ('custom', 'restaurant'));

-- Lien affilié TheFork (via Awin) pour une option de sondage resto, nullable
-- (une option de sondage 'custom' n'en a jamais). La construction de l'URL
-- (awin cread.php + IDs Awin) vit côté application (src/lib/awin.ts), jamais
-- en base -- aucune contrainte de forme ici.
alter table poll_options
  add column external_url text;

-- ============================================================
-- Migration : 20260715000200_spotify_playlist_oauth.sql
-- ============================================================
-- Playlist Spotify (Phase 8) : ANNULÉE -- décision de Thomas de retirer la
-- fonctionnalité (Spotify bloque toute app en mode développement dont le
-- compte propriétaire n'a pas Spotify Premium, et la demande d'extension de
-- quota n'est pas accessible à Konfeti avant 250 000 utilisateurs actifs/mois
-- -- voir DECISIONS.md). Ce fichier annule la migration originale (déjà
-- appliquée par Thomas) plutôt que d'être supprimé, pour garder une trace
-- cohérente de ce qui a réellement tourné sur la base.
alter table profiles
  drop column if exists spotify_user_id,
  drop column if exists spotify_access_token,
  drop column if exists spotify_refresh_token,
  drop column if exists spotify_token_expires_at;

-- Bug réel trouvé en testant une reconstruction complète depuis zéro (retour
-- Thomas : "un fichier sql avec toutes les tables") : sur une base FRAÎCHE,
-- `playlist_suggestions` n'a jamais été ajoutée à la publication realtime
-- (l'ajout faisait partie de la version ORIGINALE de ce fichier, remplacée
-- ici par son annulation) -- `alter publication ... drop table` échouait donc
-- avec "relation is not part of the publication". Sur la vraie base de
-- Thomas, la table y avait bien été ajoutée pour de vrai avant d'être
-- retirée : cette instruction a réussi une seule fois, en conditions réelles,
-- jamais rejouée depuis. Rendue idempotente pour fonctionner dans les deux
-- cas (base fraîche ou déjà migrée).
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'playlist_suggestions'
  ) then
    alter publication supabase_realtime drop table playlist_suggestions;
  end if;
end $$;

-- ============================================================
-- Migration : 20260716000100_block_participant.sql
-- ============================================================
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

-- ============================================================
-- Migration : 20260716000200_admin_backoffice.sql
-- ============================================================
-- Back-office /admin (Phase 9, brief 5.8) : trace des passages des scripts
-- planifiés (crons Vercel, webhook Stripe), pour le panneau "santé" -- rien
-- n'est persisté jusqu'ici (les crons renvoient juste un JSON à Vercel).
-- Service-role uniquement : jamais lu ni écrit par un client normal.
create table admin_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  level text not null check (level in ('info', 'error')),
  message text not null,
  created_at timestamptz not null default now()
);
alter table admin_logs enable row level security;
revoke all on admin_logs from anon, authenticated;
-- Aucune policy select/insert pour anon/authenticated : accès service-role
-- uniquement (RLS activée sans aucun grant client, même précaution que les
-- autres tables réservées au back-office).

-- Nettoyage : résidu de la Phase 8 (Playlist Spotify), construite puis
-- entièrement retirée -- voir DECISIONS.md.
delete from feature_flags where key = 'spotify';

-- ============================================================
-- Migration : 20260716000300_wire_auto_approve.sql
-- ============================================================
-- `events.auto_approve` (brief, wizard extras) est stocké depuis la Phase 1
-- mais n'a JAMAIS été consulté par le vrai flux RSVP -- un vrai gap trouvé en
-- discutant du blocage définitif avec Thomas (le bouton "Bloquer" ne doit
-- avoir de sens que si l'événement accepte n'importe qui automatiquement,
-- ce qui suppose que ce réglage fonctionne réellement). Câblage réel ici :
-- si actif, `create_own_rsvp` approuve directement (statut 'approved', rôle
-- 'guest') au lieu de 'pending', et poste le message système "joined"
-- immédiatement (même logique que `admin_approve_rsvp`, sinon l'auto-approbation
-- resterait silencieuse dans le chat). Ne s'applique jamais à `answer = 'no'`
-- (reste 'restricted', aucune notion d'approbation dans ce cas).
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
  v_role text;
  v_existing_id uuid;
  v_existing_status text;
  v_existing_blocked boolean;
  v_auto_approve boolean;
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

  select auto_approve into v_auto_approve from events where id = p_event_id;

  v_status := case
    when p_answer = 'no' then 'restricted'
    when v_auto_approve then 'approved'
    else 'pending'
  end;
  v_role := 'guest';

  if v_existing_id is not null then
    update rsvps set
      first_name = p_first_name,
      last_name = p_last_name,
      phone = p_phone,
      gender = p_gender,
      avatar_kind = p_avatar_kind,
      avatar_value = p_avatar_value,
      status = v_status,
      role = v_role,
      answer = p_answer,
      approved_at = case when v_status = 'approved' then now() else null end,
      is_anonymized = false,
      updated_at = now()
    where id = v_existing_id;
    v_rsvp_id := v_existing_id;
  else
    insert into rsvps (
      event_id, profile_id, first_name, last_name, phone, gender,
      avatar_kind, avatar_value, status, role, answer,
      approved_at
    ) values (
      p_event_id, (select auth.uid()), p_first_name, p_last_name, p_phone, p_gender,
      p_avatar_kind, p_avatar_value, v_status, v_role, p_answer,
      case when v_status = 'approved' then now() else null end
    )
    returning id into v_rsvp_id;
  end if;

  -- Même message système que `admin_approve_rsvp` (nom figé au moment de la
  -- création, voir 20260714000600) -- sinon l'auto-approbation resterait
  -- invisible dans le chat, contrairement à une validation manuelle.
  if v_status = 'approved' then
    insert into messages (event_id, rsvp_id, channel, is_system, body, system_author_name)
    values (p_event_id, v_rsvp_id, 'main', true, 'joined', trim(concat_ws(' ', p_first_name, p_last_name)));
  end if;

  return v_rsvp_id;
end;
$$;

-- ============================================================
-- Migration : 20260716000400_remove_demo_flag.sql
-- ============================================================
-- Retour Thomas (Phase 9, back-office) : le flag "demo" n'a jamais eu de
-- fonctionnalité derrière et n'en aura pas -- retiré plutôt que laissé inerte
-- indéfiniment dans /admin.
delete from feature_flags where key = 'demo';

-- ============================================================
-- Migration : 20260716000500_track_blocked_metadata.sql
-- ============================================================
-- Retour Thomas (Phase 9, back-office) : une vue globale (tous événements)
-- des personnes bloquées, avec la date du blocage et l'IP utilisée à la
-- dernière soumission -- utile pour repérer un même fauteur de troubles qui
-- reviendrait sous un autre compte.
alter table rsvps add column last_ip text;
alter table rsvps add column blocked_at timestamptz;

-- admin_block_participant pose désormais aussi blocked_at (jamais l'IP ici :
-- ce serait celle de l'ADMIN qui clique, pas celle de la personne bloquée --
-- voir last_ip, alimentée à chaque soumission par le participant lui-même).
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

  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from companions where rsvp_id = p_rsvp_id;

  update rsvps set
    status = 'removed',
    blocked = true,
    blocked_at = now(),
    updated_at = now()
  where id = p_rsvp_id;
end;
$$;

-- ============================================================
-- Migration : 20260716000600_drop_waitlist.sql
-- ============================================================
-- Retrait complet de la waitlist (retour Thomas) : la landing ne propose
-- plus ce formulaire depuis la refonte de la Phase 6 (remplacée par une
-- vraie vitrine avec captures d'écran) -- le code applicatif était déjà
-- entièrement retiré, seule la table restait. `drop table` supprime aussi
-- ses policies RLS et index au passage.
drop table if exists waitlist cascade;

-- ============================================================
-- Migration : 20260716000700_grant_last_ip_update.sql
-- ============================================================
-- Bug réel trouvé par l'audit sécurité : `last_ip` (ajoutée par
-- 20260716000500_track_blocked_metadata.sql) n'avait jamais reçu le grant
-- update dédié -- contrairement à toutes les autres colonnes self-service de
-- `rsvps` (wants_pot_access, arrived_home_at, wants_reminders...), qui suivent
-- toutes ce même pattern juste après leur `alter table add column`.
-- `src/app/[locale]/actions/rsvp.ts` (`.update({ last_ip: ip })`) échouait
-- donc silencieusement (permission refusée par PostgREST au niveau colonne) :
-- la page `/admin/blocked` n'affichait jamais de vraie IP.
grant update (last_ip) on rsvps to authenticated;

-- ============================================================
-- Migration : 20260716000800_performance_advisor_fixes.sql
-- ============================================================
-- Performance Advisor Supabase (apporté par Thomas) : 3 warnings "multiple
-- permissive policies" + 1 info "unindexed foreign key" corrigés ici. Les 3
-- warnings "unused index" restants (scheduled_messages_pending_idx,
-- bring_items_proposed_by_rsvp_id_idx, polls_proposed_by_rsvp_id_idx) sont
-- volontairement laissés tels quels : ces colonnes sont bien utilisées par de
-- vraies requêtes du code (voir leave_or_remove_participant, update_my_answer,
-- delete_own_account -- tous filtrent sur proposed_by_rsvp_id), le linter les
-- signale juste parce que le volume de trafic réel est encore trop faible
-- (dev/tests) pour que Postgres les ait déjà utilisés au moins une fois.
-- Supprimer un index utile sur cette seule base serait un vrai risque une
-- fois en production -- à réévaluer seulement si le constat persiste après un
-- vrai trafic de lancement.

-- `bring_items`/`poll_options`/`polls` avaient chacune 2 policies permissives
-- distinctes pour la même action INSERT/authenticated (l'admin qui écrit
-- directement, et l'invité qui propose son propre item/sondage/option) --
-- Postgres doit évaluer les deux à chaque INSERT. Fusionnées en une seule
-- policy par table (OR des deux conditions d'origine, comportement
-- strictement identique, juste une seule évaluation au lieu de deux).
drop policy "bring_items_write_admin" on bring_items;
drop policy "bring_items_propose_own" on bring_items;
create policy "bring_items_write_admin_or_propose_own" on bring_items
  for insert to authenticated
  with check (
    private.is_event_admin(event_id)
    or (
      status = 'pending'
      and private.is_my_rsvp(proposed_by_rsvp_id)
      and private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'bring')
    )
  );

drop policy "polls_write_admin" on polls;
drop policy "polls_propose_own" on polls;
create policy "polls_write_admin_or_propose_own" on polls
  for insert to authenticated
  with check (
    private.is_event_admin(event_id)
    or (
      status = 'pending'
      and private.is_my_rsvp(proposed_by_rsvp_id)
      and private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'polls')
    )
  );

drop policy "poll_options_write_admin" on poll_options;
drop policy "poll_options_propose_own" on poll_options;
create policy "poll_options_write_admin_or_propose_own" on poll_options
  for insert to authenticated
  with check (
    exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id))
    or exists (
      select 1 from polls p
      where p.id = poll_id
        and p.status = 'pending'
        and private.is_my_rsvp(p.proposed_by_rsvp_id)
    )
  );

-- `events_pot_data.pot_owner` (ajoutée par 20260714000500) référence
-- `profiles(id)` sans index de couverture -- même convention que
-- `events_pot_owner_idx` sur la table principale, juste oubliée ici.
create index events_pot_data_pot_owner_idx on events_pot_data(pot_owner);

-- ============================================================
-- Migration : 20260717000100_email_assets_bucket.sql
-- ============================================================
-- Retour Thomas : les images des emails (mascotte + icônes réseaux sociaux)
-- pointaient vers konfeti.belgacai.com, qui ne répond pas encore (site pas
-- déployé) -- cassées aussi bien dans la prévisualisation Supabase que dans
-- un vrai envoi de test avant le lancement. Bucket public dédié : le projet
-- Supabase, lui, est déjà en ligne dès maintenant, contrairement au site.
-- Contenu statique uniquement (jamais d'upload utilisateur ici, contrairement
-- à `event-photos`) -- pas besoin de policy RLS particulière, `public = true`
-- suffit à autoriser la lecture anonyme via l'URL publique du Storage.
insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do nothing;
