-- Les fonctions utilitaires RLS ne servent qu'a l'interieur des policies (jamais appelees
-- directement par l'app). Le Security Advisor les signale comme "executable par authenticated
-- via /rest/v1/rpc/..." -- vrai, puisque PostgREST expose automatiquement tout ce qui est dans
-- le schema `public`. La remediation officielle de Supabase pour ce cas est de sortir la fonction
-- du schema expose par l'API : PostgREST n'en fera alors plus un endpoint RPC, mais Postgres peut
-- toujours l'appeler nativement lors de l'evaluation d'une policy RLS (ce n'est pas la meme
-- mecanique). leave_or_remove_participant reste dans public : elle, on veut qu'elle soit
-- appelable directement (bouton "Quitter le groupe" / suppression admin).
--
-- Deplacer le schema d'une fonction ne casse pas les policies existantes : Postgres les a deja
-- resolues vers l'OID de la fonction a leur creation, independant du schema.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

alter function is_event_host(uuid) set schema private;
alter function my_rsvp_status(uuid) set schema private;
alter function my_rsvp_role(uuid) set schema private;
alter function is_event_admin(uuid) set schema private;
alter function is_event_approved_participant(uuid) set schema private;
alter function is_event_restricted_participant(uuid) set schema private;
alter function is_event_beneficiary(uuid) set schema private;
alter function is_block_hidden_for_me(uuid, text) set schema private;
alter function is_my_rsvp(uuid) set schema private;

-- Convention a suivre pour toute nouvelle fonction utilitaire RLS future : la creer directement
-- dans le schema `private`, et la referencer avec le prefixe (`private.is_event_admin(...)`)
-- dans les nouvelles policies.
