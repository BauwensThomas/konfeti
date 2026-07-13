-- Corrections suite à l'Advisor Sécurité de Supabase (19 warnings signalés
-- par Thomas). La plupart des warnings "SECURITY DEFINER callable par
-- authenticated" sont volontaires (chaque fonction vérifie elle-même les
-- droits de l'appelant en interne -- c'est tout le principe de ce projet :
-- le client n'écrit jamais status/role/approbation directement, voir
-- rls_policies.sql) : rien à corriger pour celles-là. Deux vrais problèmes
-- trouvés en revérifiant chacune en détail :

-- 1. `get_reminder_recipients` : fuite de PII réelle. Ni la migration
--    d'origine (20260712000300) ni sa redéfinition (20260713000400) n'ont
--    jamais fait de `revoke` avant le `grant ... to service_role` -- par
--    défaut Postgres accorde EXECUTE à PUBLIC sur toute fonction créée, donc
--    `anon` ET `authenticated` pouvaient appeler
--    `/rest/v1/rpc/get_reminder_recipients` avec n'importe quel `event_id`
--    et récupérer emails/prénoms de tous les participants -- cette fonction
--    ne vérifie AUCUNE identité de l'appelant (elle n'est censée être
--    appelée que par le cron via service_role).
revoke execute on function get_reminder_recipients(uuid) from public, anon, authenticated;
grant execute on function get_reminder_recipients(uuid) to service_role;

-- 2. `transfer_event_host` : même oubli depuis sa toute première migration
--    (20260710001900, `grant ... to authenticated` sans `revoke` avant) --
--    resté tel quel à travers toutes ses redéfinitions (`create or replace`
--    préserve les grants existants). `anon` pouvait donc l'appeler --
--    protégée en pratique par `is_event_host()` (auth.uid() est toujours
--    null pour anon, donc rejet), mais à corriger par principe, même
--    hygiène que create_own_rsvp/create_own_rsvp.
revoke execute on function transfer_event_host(uuid, uuid) from public, anon;
grant execute on function transfer_event_host(uuid, uuid) to authenticated;

-- 3. Table `waitlist` : reste de la landing "pré-lancement" (Phase 2),
--    entièrement retirée du code cette session (retour Thomas : plus une
--    page de pré-lancement mais une vraie vitrine). Sa policy INSERT
--    (`WITH CHECK (true)`) est signalée par l'Advisor comme trop permissive
--    -- sans objet, la table elle-même n'est plus utilisée : supprimée
--    entièrement plutôt que corrigée. Contenait une seule ligne, un résidu
--    d'e2e (`e2e-waitlist-...@example.com`, pas une vraie inscription).
drop table if exists waitlist;
