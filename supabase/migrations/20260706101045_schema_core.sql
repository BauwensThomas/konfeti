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
