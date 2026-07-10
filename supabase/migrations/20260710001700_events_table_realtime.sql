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
