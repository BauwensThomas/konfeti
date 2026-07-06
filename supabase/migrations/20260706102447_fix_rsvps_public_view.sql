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
