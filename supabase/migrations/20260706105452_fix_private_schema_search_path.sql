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
