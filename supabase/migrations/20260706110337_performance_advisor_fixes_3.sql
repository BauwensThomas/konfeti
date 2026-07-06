-- 3 cles etrangeres sans index de couverture (rsvp_id n'est pas la premiere colonne de leur
-- cle primaire composite, donc l'index de la PK ne sert pas pour un lookup direct par rsvp_id,
-- ni pour la suppression en cascade depuis rsvps).
create index chat_reads_rsvp_id_idx on chat_reads(rsvp_id);
create index date_votes_rsvp_id_idx on date_votes(rsvp_id);
create index message_reactions_rsvp_id_idx on message_reactions(rsvp_id);
