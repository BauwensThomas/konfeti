-- Necessaire pour que le changement d'emoji (Phase 5, une seule reaction par
-- participant) soit correctement reflete en temps reel chez les autres :
-- avec la replica identity par defaut (cle primaire seule), l'evenement
-- Realtime UPDATE ne contient que (message_id, rsvp_id) dans "old", jamais
-- l'ancien sticker_id, empechant de decrementer le bon compteur cote client.
alter table message_reactions replica identity full;
