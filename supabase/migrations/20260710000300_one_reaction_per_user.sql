-- Decision produit (retour Thomas, Phase 5) : un participant ne peut poser
-- qu'une seule reaction par message (pas une par emoji). La cle primaire
-- (message_id, rsvp_id, sticker_id) autorisait plusieurs lignes par
-- (message, participant) avec des emojis differents ; passe a
-- (message_id, rsvp_id) seul, sticker_id devient une colonne ordinaire
-- (changer d'emoji met simplement a jour la ligne existante via upsert).

-- Deduplique les donnees de test existantes (projet pre-lancement, aucune
-- vraie donnee) avant de poser la nouvelle contrainte : garde une seule
-- ligne arbitraire par (message_id, rsvp_id).
delete from message_reactions a using message_reactions b
  where a.message_id = b.message_id
    and a.rsvp_id = b.rsvp_id
    and a.sticker_id > b.sticker_id;

alter table message_reactions drop constraint message_reactions_pkey;
alter table message_reactions add primary key (message_id, rsvp_id);

-- Aucune policy UPDATE n'existait (seul insert etait prevu, une reaction ne
-- changeait jamais de valeur avant ce correctif) : necessaire maintenant
-- que changer d'avis sur l'emoji met a jour la ligne existante au lieu
-- d'en creer une nouvelle.
grant update (sticker_id) on message_reactions to authenticated;

create policy "message_reactions_update_own" on message_reactions
  for update to authenticated
  using (private.is_my_rsvp(rsvp_id))
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from messages m
      where m.id = message_reactions.message_id
        and private.is_event_approved_participant(m.event_id)
        and (m.channel = 'main' or not private.is_event_beneficiary(m.event_id))
    )
  );
