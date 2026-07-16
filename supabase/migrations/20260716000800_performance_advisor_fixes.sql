-- Performance Advisor Supabase (apporté par Thomas) : 3 warnings "multiple
-- permissive policies" + 1 info "unindexed foreign key" corrigés ici. Les 3
-- warnings "unused index" restants (scheduled_messages_pending_idx,
-- bring_items_proposed_by_rsvp_id_idx, polls_proposed_by_rsvp_id_idx) sont
-- volontairement laissés tels quels : ces colonnes sont bien utilisées par de
-- vraies requêtes du code (voir leave_or_remove_participant, update_my_answer,
-- delete_own_account -- tous filtrent sur proposed_by_rsvp_id), le linter les
-- signale juste parce que le volume de trafic réel est encore trop faible
-- (dev/tests) pour que Postgres les ait déjà utilisés au moins une fois.
-- Supprimer un index utile sur cette seule base serait un vrai risque une
-- fois en production -- à réévaluer seulement si le constat persiste après un
-- vrai trafic de lancement.

-- `bring_items`/`poll_options`/`polls` avaient chacune 2 policies permissives
-- distinctes pour la même action INSERT/authenticated (l'admin qui écrit
-- directement, et l'invité qui propose son propre item/sondage/option) --
-- Postgres doit évaluer les deux à chaque INSERT. Fusionnées en une seule
-- policy par table (OR des deux conditions d'origine, comportement
-- strictement identique, juste une seule évaluation au lieu de deux).
drop policy "bring_items_write_admin" on bring_items;
drop policy "bring_items_propose_own" on bring_items;
create policy "bring_items_write_admin_or_propose_own" on bring_items
  for insert to authenticated
  with check (
    private.is_event_admin(event_id)
    or (
      status = 'pending'
      and private.is_my_rsvp(proposed_by_rsvp_id)
      and private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'bring')
    )
  );

drop policy "polls_write_admin" on polls;
drop policy "polls_propose_own" on polls;
create policy "polls_write_admin_or_propose_own" on polls
  for insert to authenticated
  with check (
    private.is_event_admin(event_id)
    or (
      status = 'pending'
      and private.is_my_rsvp(proposed_by_rsvp_id)
      and private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'polls')
    )
  );

drop policy "poll_options_write_admin" on poll_options;
drop policy "poll_options_propose_own" on poll_options;
create policy "poll_options_write_admin_or_propose_own" on poll_options
  for insert to authenticated
  with check (
    exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id))
    or exists (
      select 1 from polls p
      where p.id = poll_id
        and p.status = 'pending'
        and private.is_my_rsvp(p.proposed_by_rsvp_id)
    )
  );

-- `events_pot_data.pot_owner` (ajoutée par 20260714000500) référence
-- `profiles(id)` sans index de couverture -- même convention que
-- `events_pot_owner_idx` sur la table principale, juste oubliée ici.
create index events_pot_data_pot_owner_idx on events_pot_data(pot_owner);
