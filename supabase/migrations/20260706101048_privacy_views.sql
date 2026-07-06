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
