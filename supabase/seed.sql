-- Seed de test Konfeti (Phase 1).
-- Cree un evenement complet avec des participants dans chaque statut/role, pour verifier
-- manuellement la RLS et les vues de confidentialite depuis Supabase Studio ou l'app.
-- UUIDs fixes pour pouvoir s'y referer facilement pendant les tests.

-- ============================================================
-- Comptes (auth.users -> profiles cree automatiquement par le trigger)
-- ============================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'thomas.host@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name": "Thomas"}', false),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'julie.admin@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name": "Julie"}', false),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'marc.guest@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name": "Marc"}', false),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'sophie.pending@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name": "Sophie"}', false),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'ali.restricted@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name": "Ali"}', false),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'emma.beneficiaire@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{}', '{"full_name": "Emma"}', false);

-- Completion des profils (le trigger a deja cree les lignes avec juste first_name)
update profiles set phone = '+32470000001', gender = 'male' where id = '11111111-1111-1111-1111-111111111111';
update profiles set phone = '+32470000002', gender = 'female' where id = '22222222-2222-2222-2222-222222222222';
update profiles set phone = '+32470000003', gender = 'male' where id = '33333333-3333-3333-3333-333333333333';
update profiles set phone = '+32470000004', gender = 'female' where id = '44444444-4444-4444-4444-444444444444';
update profiles set phone = '+32470000005', gender = 'male' where id = '55555555-5555-5555-5555-555555555555';
update profiles set phone = '+32470000006', gender = 'female' where id = '66666666-6666-6666-6666-666666666666';

-- ============================================================
-- Evenement : l'anniversaire d'Emma
-- ============================================================
insert into events (
  id, short_code, host_id, title, description, theme, occasion, birthday_person, birthday_date,
  birthday_age, show_age, instructions, dress_code, bring_general, kids_allowed, pets_allowed,
  starts_at, ends_at, location_text, location_lat, location_lng, max_guests, pot_enabled,
  pot_mode, pot_goal_cents, pot_label, beneficiary_hidden_blocks, status
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'FIESTA-4291', '11111111-1111-1111-1111-111111111111',
  'Anniversaire surprise d''Emma', 'On fete les 30 ans d''Emma dans le jardin, feu de camp si il fait beau !',
  'birthday', 'birthday', 'Emma', '2026-07-20', 30, true,
  'Parking rue du Verger, on sonne au portail bleu.', 'decontracte', 'un maillot si il fait chaud',
  'yes', 'no', now() + interval '14 days', now() + interval '14 days' + interval '6 hours',
  'Rue du Verger 12, 1000 Bruxelles', 50.8503, 4.3517, 40, true,
  'goal', 15000, 'Cadeau collectif pour Emma', array['bring', 'polls'], 'active'
);

update feature_flags set enabled = true where key = 'pot';

-- ============================================================
-- Participations
-- ============================================================
insert into rsvps (id, event_id, profile_id, first_name, last_name, phone, gender, status, role, answer, approved_by, approved_at) values
  ('aaaaaaaa-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Thomas', 'Bauwens', '+32470000001', 'male', 'approved', 'admin', 'yes', '11111111-1111-1111-1111-111111111111', now()),
  ('aaaaaaaa-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Julie', 'Dean', '+32470000002', 'female', 'approved', 'admin', 'yes', '11111111-1111-1111-1111-111111111111', now()),
  ('aaaaaaaa-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'Marc', 'Lemoine', '+32470000003', 'male', 'approved', 'guest', 'yes', '11111111-1111-1111-1111-111111111111', now()),
  ('aaaaaaaa-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Sophie', 'Renard', '+32470000004', 'female', 'pending', 'guest', 'maybe', null, null),
  ('aaaaaaaa-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'Ali', 'Ozturk', '+32470000005', 'male', 'restricted', 'guest', 'no', '11111111-1111-1111-1111-111111111111', now()),
  ('aaaaaaaa-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'Emma', 'Verstraete', '+32470000006', 'female', 'approved', 'beneficiary', 'yes', '11111111-1111-1111-1111-111111111111', now());

-- Un accompagnant pour Marc
insert into companions (rsvp_id, kind, first_name) values
  ('aaaaaaaa-3333-3333-3333-333333333333', 'partner', 'Lea');

-- ============================================================
-- Qui amene quoi
-- ============================================================
insert into bring_items (id, event_id, label, quantity_needed) values
  ('bbbbbbbb-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bouteilles de soft', 6),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Paquets de chips', 4);

insert into bring_claims (item_id, rsvp_id, quantity) values
  ('bbbbbbbb-1111-1111-1111-111111111111', 'aaaaaaaa-2222-2222-2222-222222222222', 3),
  ('bbbbbbbb-1111-1111-1111-111111111111', 'aaaaaaaa-3333-3333-3333-333333333333', 4),
  ('bbbbbbbb-2222-2222-2222-222222222222', 'aaaaaaaa-3333-3333-3333-333333333333', 2);

-- ============================================================
-- Sondage
-- ============================================================
insert into polls (id, event_id, question) values
  ('cccccccc-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Quel gateau pour Emma ?');

insert into poll_options (id, poll_id, label) values
  ('dddddddd-1111-1111-1111-111111111111', 'cccccccc-1111-1111-1111-111111111111', 'Chocolat'),
  ('dddddddd-2222-2222-2222-222222222222', 'cccccccc-1111-1111-1111-111111111111', 'Fruits rouges');

insert into poll_votes (option_id, rsvp_id) values
  ('dddddddd-1111-1111-1111-111111111111', 'aaaaaaaa-2222-2222-2222-222222222222'),
  ('dddddddd-1111-1111-1111-111111111111', 'aaaaaaaa-3333-3333-3333-333333333333');

-- ============================================================
-- Chat
-- ============================================================
insert into messages (event_id, rsvp_id, channel, body, is_system) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'main', 'Julie D a rejoint la fete !', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-2222-2222-2222-222222222222', 'main', 'Hate d''y etre !', false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-1111-1111-111111111111', 'backstage', 'On cache le cadeau chez moi jusqu''au jour J', false);
