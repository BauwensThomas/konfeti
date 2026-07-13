-- Performance Advisor (INFO) : deux clés étrangères sans index couvrant,
-- utilisées pour retrouver "mes propositions en attente" (qui apporte quoi
-- + sondages) -- ajout simple et sans risque, aucun changement de
-- comportement.
create index if not exists bring_items_proposed_by_rsvp_id_idx on bring_items(proposed_by_rsvp_id);
create index if not exists polls_proposed_by_rsvp_id_idx on polls(proposed_by_rsvp_id);
