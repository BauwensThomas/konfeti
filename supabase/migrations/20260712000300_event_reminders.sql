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
