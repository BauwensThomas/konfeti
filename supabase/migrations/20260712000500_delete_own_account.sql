-- Suppression de compte en libre-service (retour Thomas : "on doit pouvoir
-- supprimer son compte, et effacer toutes les données... retirer toutes les
-- infos du profil, passer les messages dans le chat en anonyme, retirer le
-- vote dans les sondages, de qui apporte quoi avec les +1 compris"), brief
-- section 9 (RGPD, droit à l'effacement) + section 4.8.
--
-- Même logique d'anonymisation que `leave_or_remove_participant` (quitter un
-- SEUL événement), appliquée ici à TOUTES les participations du compte à la
-- fois : les messages de chat et `pot_contributions` ne sont jamais
-- supprimés (ils restent "Anonyme" via la jointure sur la ligne rsvps
-- anonymisée, déjà comment ce mécanisme fonctionne), mais `poll_votes`,
-- `bring_claims`, `companions` (les "+1") et les sondages/items proposés
-- encore en attente sont bien supprimés.
--
-- Différence clé avec `leave_or_remove_participant` : celle-ci laisse
-- `profile_id` intact (pour permettre une réactivation propre si la
-- personne revient un jour sur CET événement précis) -- ici, le compte
-- lui-même va disparaître, `profile_id` doit donc être nullifié partout,
-- sans quoi la contrainte de clé étrangère `rsvps.profile_id references
-- profiles(id)` empêcherait la suppression de la ligne `profiles`.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_rsvp record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Un organisateur ne peut pas supprimer son compte tant qu'il reste
  -- l'hôte d'un événement (même règle que "quitter/être retiré", mais
  -- appliquée à l'échelle du compte) : `events.host_id references
  -- profiles(id)` bloquerait de toute façon la suppression du profil, et
  -- transférer l'organisation en amont (déjà possible, `transfer_event_host`)
  -- évite de supprimer silencieusement l'événement d'autres participants.
  if exists (select 1 from events where host_id = v_uid) then
    raise exception 'still hosting events, transfer organization first';
  end if;

  for v_rsvp in
    select id from rsvps where profile_id = v_uid and status not in ('left', 'removed')
  loop
    delete from poll_votes where rsvp_id = v_rsvp.id;
    delete from polls where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from date_votes where rsvp_id = v_rsvp.id;
    delete from bring_claims where rsvp_id = v_rsvp.id;
    delete from bring_items where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from companions where rsvp_id = v_rsvp.id;
    delete from playlist_suggestions where rsvp_id = v_rsvp.id and added_to_playlist = false;

    update rsvps set
      is_anonymized = true,
      status = 'left',
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      guest_code = null,
      profile_id = null,
      updated_at = now()
    where id = v_rsvp.id;
  end loop;

  -- Participations déjà quittées/retirées avant cette suppression de compte
  -- (donc pas reprises par la boucle ci-dessus, déjà anonymisées) : leur
  -- `profile_id` avait volontairement été laissé intact par
  -- `leave_or_remove_participant` -- il doit l'être ici aussi, sans quoi la
  -- suppression du profil échouerait sur la contrainte de clé étrangère.
  update rsvps set profile_id = null where profile_id = v_uid;

  -- Autres références directes à `profiles(id)` qui bloqueraient sinon la
  -- suppression du profil : une approbation passée sur la participation de
  -- quelqu'un d'autre, ou un rôle de bénéficiaire de cagnotte désigné.
  update rsvps set approved_by = null where approved_by = v_uid;
  update events set pot_owner = null where pot_owner = v_uid;
end;
$$;

revoke execute on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;
