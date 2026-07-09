-- Decision produit (retour Thomas en testant le chat, Phase 5) : la
-- suppression d'un message reste reservee aux admins (moderation douce,
-- deja en place via messages_moderate_admin/deleted_by_admin). L'auteur
-- d'un message peut a la place le modifier, mais seulement dans les 30
-- secondes suivant l'envoi (le temps de corriger une faute de frappe, pas
-- de reecrire l'historique). Passe ce delai, plus aucune modification
-- possible de son cote.

-- Retire la suppression physique de son propre message : seule la
-- moderation admin (soft delete via deleted_by_admin) permet de faire
-- disparaitre un message desormais, quel qu'en soit l'auteur.
drop policy "messages_delete_own" on messages;

-- Edition de son propre message dans les 30 secondes suivant l'envoi.
-- security definer : `body` n'est pas dans les colonnes update accordees au
-- client (voir grants sur messages, rls_policies.sql), la fenetre de temps
-- doit aussi etre verifiee cote serveur, pas seulement par l'UI.
create or replace function edit_own_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rsvp_id uuid;
  v_is_system boolean;
  v_created_at timestamptz;
begin
  select rsvp_id, is_system, created_at into v_rsvp_id, v_is_system, v_created_at
  from messages where id = p_message_id;

  if v_rsvp_id is null then
    raise exception 'message not found';
  end if;

  if not is_my_rsvp(v_rsvp_id) then
    raise exception 'not authorized';
  end if;

  if v_is_system then
    raise exception 'system messages cannot be edited';
  end if;

  if v_created_at < now() - interval '30 seconds' then
    raise exception 'edit window expired';
  end if;

  update messages set body = p_body where id = p_message_id;
end;
$$;

revoke execute on function edit_own_message(uuid, text) from public, anon;
grant execute on function edit_own_message(uuid, text) to authenticated;
