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
