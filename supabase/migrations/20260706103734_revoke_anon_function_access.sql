-- Le reset du schema public (voir DECISIONS.md, incident timestamps de migration) a recree les
-- privileges par defaut de Supabase, qui accordent EXECUTE sur toutes les fonctions a anon et
-- authenticated. Ce n'est pas ce qu'on veut : on retire tout, puis on ne redonne que le strict
-- necessaire.

-- Fonctions utilitaires RLS : utilisees UNIQUEMENT a l'interieur des policies, evaluees en tant
-- que "authenticated" (jamais par un visiteur anonyme, qui ne passe jamais ces checks de toute
-- facon). Executees automatiquement par le moteur RLS, mais un appel RPC direct par un role qui
-- n'en a pas besoin ne doit pas etre possible.
revoke execute on function is_event_host(uuid) from public, anon, authenticated;
revoke execute on function my_rsvp_status(uuid) from public, anon, authenticated;
revoke execute on function my_rsvp_role(uuid) from public, anon, authenticated;
revoke execute on function is_event_admin(uuid) from public, anon, authenticated;
revoke execute on function is_event_approved_participant(uuid) from public, anon, authenticated;
revoke execute on function is_event_restricted_participant(uuid) from public, anon, authenticated;
revoke execute on function is_event_beneficiary(uuid) from public, anon, authenticated;
revoke execute on function is_block_hidden_for_me(uuid, text) from public, anon, authenticated;
revoke execute on function is_my_rsvp(uuid) from public, anon, authenticated;

-- Necessaire pour que les policies RLS evaluees en tant que "authenticated" fonctionnent
-- (le reste de la RLS -- events, rsvps, messages... -- s'appuie dessus). "anon" n'en a jamais
-- besoin puisqu'il n'a acces a aucune des tables/vues qui les utilisent.
grant execute on function is_event_host(uuid) to authenticated;
grant execute on function my_rsvp_status(uuid) to authenticated;
grant execute on function my_rsvp_role(uuid) to authenticated;
grant execute on function is_event_admin(uuid) to authenticated;
grant execute on function is_event_approved_participant(uuid) to authenticated;
grant execute on function is_event_restricted_participant(uuid) to authenticated;
grant execute on function is_event_beneficiary(uuid) to authenticated;
grant execute on function is_block_hidden_for_me(uuid, text) to authenticated;
grant execute on function is_my_rsvp(uuid) to authenticated;

-- leave_or_remove_participant : seuls les utilisateurs connectes (compte reel ou anonyme Supabase,
-- voir doc/ARCHITECTURE.md) peuvent l'appeler, jamais un visiteur anonyme sans session
revoke execute on function leave_or_remove_participant(uuid, text) from public, anon;
grant execute on function leave_or_remove_participant(uuid, text) to authenticated;

-- handle_new_auth_user / touch_updated_at : fonctions de trigger uniquement, jamais appelees
-- directement par un client. Le trigger continue de fonctionner sans EXECUTE (il n'est pas soumis
-- a ce privilege), seul l'appel RPC direct est desormais bloque.
revoke execute on function handle_new_auth_user() from public, anon, authenticated;
revoke execute on function touch_updated_at() from public, anon, authenticated;
