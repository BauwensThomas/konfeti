-- "Qui apporte quoi", suite (brief 4.4, retour Thomas) : "quand quelqu'un
-- demande pour rajouter un produit, c'est qu'il va ramener ça" -- a
-- l'approbation d'une proposition, une reclamation (bring_claims) doit
-- etre creee automatiquement pour le proposant (quantite qu'il avait
-- indiquee). Meme chose pour la fusion d'une proposition en double dans un
-- item existant ("l'admin doit pouvoir choisir... si quelqu'un a deja
-- propose ce produit").
--
-- Ces deux actions sont executees par l'ADMIN qui modere (pas par le
-- proposant lui-meme) : `bring_claims_write_own` (INSERT) n'autorisait
-- jusqu'ici que `is_my_rsvp(rsvp_id)` -- un admin inserant une claim POUR
-- QUELQU'UN D'AUTRE echouait donc. Elargie pour autoriser aussi un admin de
-- l'evenement, meme pattern deja en place pour `bring_claims_update`.

drop policy "bring_claims_write_own" on bring_claims;
create policy "bring_claims_write_own" on bring_claims
  for insert to authenticated
  with check (
    exists (
      select 1 from bring_items bi
      where bi.id = item_id
        and (
          private.is_event_admin(bi.event_id)
          or (
            private.is_my_rsvp(rsvp_id)
            and private.is_event_approved_participant(bi.event_id)
            and not private.is_block_hidden_for_me(bi.event_id, 'bring')
          )
        )
    )
  );
