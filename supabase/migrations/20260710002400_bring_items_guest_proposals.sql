-- "Qui apporte quoi", suite (brief 4.4, retour Thomas) : "que penses-tu si
-- sur la page participer, tous les utilisateurs peuvent rajouter des
-- produits qui ne sont pas dans la liste ? avec une moderation par les
-- admins et/ou l'organisateur, avec une notif rouge sur participer comme
-- pour personnes ?" -- confirme ("go"). Jusqu'ici, `bring_items_write_admin`
-- (for all, admin uniquement) etait la SEULE policy d'ecriture : aucun
-- participant ne pouvait rien inserer.

alter table bring_items
  add column status text not null default 'approved' check (status in ('pending', 'approved'));

alter table bring_items
  add column proposed_by_rsvp_id uuid references rsvps(id) on delete set null;

-- Un non-admin ne voit desormais que les items APPROUVES (les 'pending'
-- restent invisibles pour tout le monde sauf l'admin qui doit les moderer) --
-- meme philosophie que la file d'attente RSVP.
drop policy "bring_items_select" on bring_items;
create policy "bring_items_select" on bring_items
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (
      private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'bring')
      and status = 'approved'
    )
  );

-- Nouveau : un participant approuve (non masque du bloc 'bring') peut
-- proposer un item, TOUJOURS en 'pending' et TOUJOURS associe a SA PROPRE
-- ligne rsvp -- jamais approuve directement par cette policy.
-- `bring_items_write_admin` (for all, inchangee) couvre deja l'approbation
-- (UPDATE status) et le refus (DELETE) d'un item, y compris 'pending'.
create policy "bring_items_propose_own" on bring_items
  for insert to authenticated
  with check (
    status = 'pending'
    and private.is_my_rsvp(proposed_by_rsvp_id)
    and private.is_event_approved_participant(event_id)
    and not private.is_block_hidden_for_me(event_id, 'bring')
  );
