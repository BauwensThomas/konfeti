-- Retour Thomas : "il faut une etape 5 [dans le wizard], avec le ou les
-- beneficiaires peuvent voir la cagnotte, le chat, les personnes, qui
-- apporte quoi etc." -- jusqu'ici, `beneficiary_hidden_blocks` (text[),
-- deja en base) ne pilotait QUE bring/polls/playlist (aucune UI ne l'a
-- jamais rempli), et la cagnotte / le fil Coulisses etaient codes en dur
-- "toujours masques au beneficiaire", jamais desactivables.
--
-- Decisions confirmees avec Thomas (plusieurs allers-retours, voir
-- DECISIONS.md pour le detail complet) :
-- 1. La cagnotte devient configurable comme le reste (nouvelle valeur 'pot').
-- 2. Le fil COULISSES (canal 'backstage') devient configurable (nouvelle
--    valeur 'backstage', remplace la regle codee en dur
--    is_event_beneficiary) : "dans coulisses, s'il est coche il ne voit
--    pas le chat coulisses". Les deux onglets General/Coulisses restent
--    TOUJOURS visibles (cote applicatif) meme pour un beneficiaire bloque
--    -- seul le contenu de l'onglet actif est remplace par un message
--    "pas d'acces", jamais tout le panneau.
-- 3. Le CHAT GENERAL (canal 'main') devient LUI AUSSI configurable
--    (nouvelle valeur 'chat', ajoutee apres coup -- Thomas avait d'abord
--    demande qu'il reste toujours accessible, puis est revenu dessus en
--    constatant qu'un beneficiaire masque de la liste Personnes restait
--    quand meme visible comme auteur de messages dans le chat general :
--    "rajouter une possibilite de masquer le chat general pour les
--    beneficiaires"). Meme mecanique exacte que Coulisses (onglet toujours
--    visible, contenu remplace si bloque).
--
-- La liste Personnes (bloc 'participants', demande aussi par Thomas) N'EST
-- PAS ajoutee a cette meme mecanique RLS : rsvps_public_data sert aussi a
-- resoudre les noms d'auteur dans le chat (ChatRoom.resolveAuthor), la
-- restreindre casserait ca pour tout le monde. Ce bloc reste masque au
-- niveau applicatif uniquement (page.tsx ne rend pas <EventPersonnes> pour
-- un beneficiaire concerne) -- protection plus legere que les 5 autres
-- blocs RLS, assumee et documentee, pas une regression cachee.

-- ============================================================
-- a) Cagnotte : desormais pilotee par is_block_hidden_for_me(event_id, 'pot')
-- au lieu de is_event_beneficiary(event_id) code en dur. Meme pattern deja
-- utilise pour playlist_select (admin toujours ; participant approuve
-- seulement si le bloc n'est pas masque pour lui).
-- ============================================================
drop policy "pot_contributions_select" on pot_contributions;
create policy "pot_contributions_select" on pot_contributions
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (is_event_approved_participant(event_id) and not is_block_hidden_for_me(event_id, 'pot'))
  );
-- pot_payouts_select_admin (details Stripe) INCHANGEE : jamais montre a un
-- beneficiaire meme admin, hors perimetre de cette demande.

-- ============================================================
-- b) Chat, les deux canaux ('main' ET 'backstage') desormais pilotes
-- chacun par leur propre entree dans beneficiary_hidden_blocks
-- ('chat'/'backstage'), au lieu de is_event_beneficiary(event_id) code en
-- dur (qui ne s'appliquait de toute facon qu'a 'backstage'). Corps repris
-- tel quel depuis la derniere version connue de chaque policy
-- (20260710000000_chat_phase5.sql / 20260710000300_one_reaction_per_user.sql),
-- seule la condition par canal change.
-- ============================================================
drop policy "messages_select" on messages;
create policy "messages_select" on messages
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (
      is_event_approved_participant(event_id)
      and (
        (channel = 'main' and not is_block_hidden_for_me(event_id, 'chat'))
        or (channel = 'backstage' and not is_block_hidden_for_me(event_id, 'backstage'))
      )
    )
  );

drop policy "messages_insert_own" on messages;
create policy "messages_insert_own" on messages
  for insert to authenticated
  with check (
    is_event_approved_participant(event_id)
    and is_my_rsvp(rsvp_id)
    and (
      (channel = 'main' and not is_block_hidden_for_me(event_id, 'chat'))
      or (channel = 'backstage' and not is_block_hidden_for_me(event_id, 'backstage'))
    )
  );

drop policy "message_reactions_select" on message_reactions;
create policy "message_reactions_select" on message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and (
          private.is_event_admin(m.event_id)
          or (
            private.is_event_approved_participant(m.event_id)
            and (
              (m.channel = 'main' and not private.is_block_hidden_for_me(m.event_id, 'chat'))
              or (m.channel = 'backstage' and not private.is_block_hidden_for_me(m.event_id, 'backstage'))
            )
          )
        )
    )
  );

drop policy "message_reactions_write_own" on message_reactions;
create policy "message_reactions_write_own" on message_reactions
  for insert to authenticated
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from messages m
      where m.id = message_id
        and private.is_event_approved_participant(m.event_id)
        and (
          (m.channel = 'main' and not private.is_block_hidden_for_me(m.event_id, 'chat'))
          or (m.channel = 'backstage' and not private.is_block_hidden_for_me(m.event_id, 'backstage'))
        )
    )
  );

drop policy "message_reactions_update_own" on message_reactions;
create policy "message_reactions_update_own" on message_reactions
  for update to authenticated
  using (private.is_my_rsvp(rsvp_id))
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from messages m
      where m.id = message_reactions.message_id
        and private.is_event_approved_participant(m.event_id)
        and (
          (m.channel = 'main' and not private.is_block_hidden_for_me(m.event_id, 'chat'))
          or (m.channel = 'backstage' and not private.is_block_hidden_for_me(m.event_id, 'backstage'))
        )
    )
  );

drop policy "event_photos_message_photo_select" on storage.objects;
create policy "event_photos_message_photo_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos' and exists (
      select 1 from messages
      where messages.photo_url = storage.objects.name
        and (
          private.is_event_admin(messages.event_id)
          or (
            private.is_event_approved_participant(messages.event_id)
            and (
              (messages.channel = 'main' and not private.is_block_hidden_for_me(messages.event_id, 'chat'))
              or (messages.channel = 'backstage' and not private.is_block_hidden_for_me(messages.event_id, 'backstage'))
            )
          )
        )
    )
  );

-- ============================================================
-- c) Backfill : sans ca, tous les evenements DEJA crees perdraient
-- instantanement leur masquage cagnotte/Coulisses (l'ancienne regle codee
-- en dur disparait avec les policies ci-dessus, remplacee par la lecture
-- de ce tableau). Le chat general ('chat') N'EST PAS ajoute au backfill :
-- il n'a jamais ete masquable avant cette feature, donc aucun evenement
-- existant n'a besoin de le voir apparaitre masque par surprise -- les
-- nouveaux evenements partent de la case decochee par defaut (voir
-- CreateEventWizard.INITIAL_DATA), exactement comme bring/polls/playlist.
-- ============================================================
update events
set beneficiary_hidden_blocks = (
  select array_agg(distinct block)
  from unnest(beneficiary_hidden_blocks || array['pot', 'backstage']) as block
)
where not (beneficiary_hidden_blocks @> array['pot', 'backstage']);
