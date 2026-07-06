-- RLS : activee sur TOUTES les tables, tout est refuse par defaut, chaque acces est explicite (brief 5.5).
--
-- Identite : chaque participant (compte reel email/Google OU invite "code d'acces") passe par
-- Supabase Auth et a donc un auth.uid() -- les invites "code" utilisent l'auth anonyme Supabase
-- (signInAnonymously), le "code d'acces" servant uniquement de mecanisme de recuperation
-- cross-device (voir doc/ARCHITECTURE.md et doc/DECISIONS.md pour le detail de ce choix).
--
-- Colonnes sensibles (last_name complet, phone, gender, contenu cagnotte...) : jamais de grant
-- direct au client sur les colonnes de decision (status, role, approbation...), qui ne changent
-- que via des fonctions security definer ou le service_role (webhooks Stripe, back-office).

-- ============================================================
-- profiles
-- ============================================================
alter table profiles enable row level security;

revoke all on profiles from anon, authenticated;
grant select on profiles to authenticated;
grant insert (id, first_name, last_name, phone, gender, avatar_kind, avatar_value) on profiles to authenticated;
grant update (first_name, last_name, phone, gender, avatar_kind, avatar_value) on profiles to authenticated;

create policy "profiles_select_own" on profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own" on profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- events
-- ============================================================
alter table events enable row level security;

create policy "events_select_full_for_participants" on events
  for select to authenticated
  using (
    is_event_admin(id)
    or is_event_approved_participant(id)
  );

create policy "events_insert_as_host" on events
  for insert to authenticated
  with check (host_id = auth.uid());

create policy "events_update_by_admin" on events
  for update to authenticated
  using (is_event_admin(id))
  with check (is_event_admin(id));

-- Pas de policy delete : aucune suppression physique depuis l'interface (brief 5.5),
-- l'annulation se fait via status = 'cancelled' (deja couvert par la policy update ci-dessus).

-- ============================================================
-- rsvps
-- ============================================================
alter table rsvps enable row level security;

revoke all on rsvps from anon, authenticated;
grant select on rsvps to authenticated;
grant insert (
  event_id, profile_id, first_name, last_name, phone, gender, avatar_kind, avatar_value,
  answer, guest_contact, contact_consent, contact_visible, is_designated_driver
) on rsvps to authenticated;
grant update (
  first_name, last_name, phone, gender, avatar_kind, avatar_value, answer,
  guest_contact, contact_consent, contact_visible, is_designated_driver, checked_in_at
) on rsvps to authenticated;

-- Un participant voit sa propre ligne complete ; les admins/host voient toutes les lignes de leur evenement
create policy "rsvps_select_own_or_admin" on rsvps
  for select to authenticated
  using (
    profile_id = auth.uid()
    or is_event_admin(event_id)
  );

-- Un utilisateur ne cree une participation que pour lui-meme
create policy "rsvps_insert_self" on rsvps
  for insert to authenticated
  with check (profile_id = auth.uid());

-- Un participant ne modifie que SA ligne (colonnes limitees par les grants ci-dessus :
-- status/role/approbation/guest_code restent hors de portee du client, reserves aux fonctions
-- security definer ou au service_role -- a construire en Phase 4 pour la validation/les roles)
create policy "rsvps_update_own" on rsvps
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================
-- companions
-- ============================================================
alter table companions enable row level security;

create policy "companions_select" on companions
  for select to authenticated
  using (
    is_my_rsvp(rsvp_id)
    or is_event_admin((select event_id from rsvps where id = rsvp_id))
  );

create policy "companions_write_own" on companions
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (is_my_rsvp(rsvp_id));

-- ============================================================
-- messages
-- ============================================================
alter table messages enable row level security;

revoke all on messages from anon, authenticated;
grant select on messages to authenticated;
grant insert (event_id, rsvp_id, channel, body, photo_url, reply_to) on messages to authenticated;
grant update (deleted_by_admin) on messages to authenticated;
grant delete on messages to authenticated;

create policy "messages_select" on messages
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (
      is_event_approved_participant(event_id)
      and (channel = 'main' or not is_event_beneficiary(event_id))
    )
  );

create policy "messages_insert_own" on messages
  for insert to authenticated
  with check (
    is_event_approved_participant(event_id)
    and is_my_rsvp(rsvp_id)
    and (channel = 'main' or not is_event_beneficiary(event_id))
  );

-- Moderation admin (suppression de n'importe quel message via deleted_by_admin)
create policy "messages_moderate_admin" on messages
  for update to authenticated
  using (is_event_admin(event_id))
  with check (is_event_admin(event_id));

-- Suppression de ses propres messages
create policy "messages_delete_own" on messages
  for delete to authenticated
  using (is_my_rsvp(rsvp_id) and not is_system);

-- ============================================================
-- message_reactions
-- ============================================================
alter table message_reactions enable row level security;

create policy "message_reactions_select" on message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from messages m
      where m.id = message_id
        and (is_event_admin(m.event_id) or is_event_approved_participant(m.event_id))
    )
  );

create policy "message_reactions_write_own" on message_reactions
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (is_my_rsvp(rsvp_id));

-- ============================================================
-- chat_reads
-- ============================================================
alter table chat_reads enable row level security;

create policy "chat_reads_own" on chat_reads
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (is_my_rsvp(rsvp_id));

-- ============================================================
-- date_options / date_votes
-- ============================================================
alter table date_options enable row level security;

create policy "date_options_select" on date_options
  for select to authenticated
  using (is_event_admin(event_id) or is_event_approved_participant(event_id));

create policy "date_options_write_admin" on date_options
  for all to authenticated
  using (is_event_admin(event_id))
  with check (is_event_admin(event_id));

alter table date_votes enable row level security;

create policy "date_votes_select" on date_votes
  for select to authenticated
  using (
    exists (
      select 1 from date_options d
      where d.id = option_id
        and (is_event_admin(d.event_id) or is_event_approved_participant(d.event_id))
    )
  );

create policy "date_votes_write_own" on date_votes
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (
    is_my_rsvp(rsvp_id)
    and exists (
      select 1 from date_options d
      where d.id = option_id and is_event_approved_participant(d.event_id)
    )
  );

-- ============================================================
-- polls / poll_options / poll_votes
-- ============================================================
alter table polls enable row level security;

create policy "polls_select" on polls
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (is_event_approved_participant(event_id) and not is_block_hidden_for_me(event_id, 'polls'))
  );

create policy "polls_write_admin" on polls
  for all to authenticated
  using (is_event_admin(event_id))
  with check (is_event_admin(event_id));

alter table poll_options enable row level security;

create policy "poll_options_select" on poll_options
  for select to authenticated
  using (
    exists (
      select 1 from polls p
      where p.id = poll_id
        and (
          is_event_admin(p.event_id)
          or (is_event_approved_participant(p.event_id) and not is_block_hidden_for_me(p.event_id, 'polls'))
        )
    )
  );

create policy "poll_options_write_admin" on poll_options
  for all to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and is_event_admin(p.event_id)))
  with check (exists (select 1 from polls p where p.id = poll_id and is_event_admin(p.event_id)));

alter table poll_votes enable row level security;

create policy "poll_votes_select" on poll_votes
  for select to authenticated
  using (
    exists (
      select 1 from poll_options po join polls p on p.id = po.poll_id
      where po.id = option_id
        and (is_event_admin(p.event_id) or is_event_approved_participant(p.event_id))
    )
  );

create policy "poll_votes_write_own" on poll_votes
  for all to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (
    is_my_rsvp(rsvp_id)
    and exists (
      select 1 from poll_options po join polls p on p.id = po.poll_id
      where po.id = option_id
        and is_event_approved_participant(p.event_id)
        and not is_block_hidden_for_me(p.event_id, 'polls')
    )
  );

-- ============================================================
-- bring_items / bring_claims
-- ============================================================
alter table bring_items enable row level security;

create policy "bring_items_select" on bring_items
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (is_event_approved_participant(event_id) and not is_block_hidden_for_me(event_id, 'bring'))
  );

create policy "bring_items_write_admin" on bring_items
  for all to authenticated
  using (is_event_admin(event_id))
  with check (is_event_admin(event_id));

alter table bring_claims enable row level security;

revoke all on bring_claims from anon, authenticated;
grant select on bring_claims to authenticated;
grant insert (item_id, rsvp_id, quantity) on bring_claims to authenticated;
grant update (quantity) on bring_claims to authenticated;
grant update (brought) on bring_claims to authenticated;
grant delete on bring_claims to authenticated;

create policy "bring_claims_select" on bring_claims
  for select to authenticated
  using (
    exists (
      select 1 from bring_items bi
      where bi.id = item_id
        and (
          is_event_admin(bi.event_id)
          or (is_event_approved_participant(bi.event_id) and not is_block_hidden_for_me(bi.event_id, 'bring'))
        )
    )
  );

create policy "bring_claims_write_own" on bring_claims
  for insert to authenticated
  with check (
    is_my_rsvp(rsvp_id)
    and exists (
      select 1 from bring_items bi
      where bi.id = item_id
        and is_event_approved_participant(bi.event_id)
        and not is_block_hidden_for_me(bi.event_id, 'bring')
    )
  );

create policy "bring_claims_update_own" on bring_claims
  for update to authenticated
  using (is_my_rsvp(rsvp_id))
  with check (is_my_rsvp(rsvp_id));

create policy "bring_claims_delete_own" on bring_claims
  for delete to authenticated
  using (is_my_rsvp(rsvp_id));

-- Suivi jour J : un admin coche "apporte" sur n'importe quelle ligne de son evenement
create policy "bring_claims_admin_checkin" on bring_claims
  for update to authenticated
  using (exists (select 1 from bring_items bi where bi.id = item_id and is_event_admin(bi.event_id)))
  with check (exists (select 1 from bring_items bi where bi.id = item_id and is_event_admin(bi.event_id)));

-- ============================================================
-- pot_contributions / pot_payouts
-- La cagnotte est TOUJOURS masquee au beneficiaire (non desactivable, brief 1.4).
-- Les ecritures (montants, frais, statut Stripe) passent uniquement par le webhook Stripe
-- (service_role, Phase 7) : aucun grant insert/update cote client ici.
-- ============================================================
alter table pot_contributions enable row level security;

revoke all on pot_contributions from anon, authenticated;
grant select on pot_contributions to authenticated;

create policy "pot_contributions_select" on pot_contributions
  for select to authenticated
  using (
    (is_event_admin(event_id) and not is_event_beneficiary(event_id))
    or (is_my_rsvp(rsvp_id) and not is_event_beneficiary(event_id))
  );

alter table pot_payouts enable row level security;

revoke all on pot_payouts from anon, authenticated;
grant select on pot_payouts to authenticated;

create policy "pot_payouts_select_admin" on pot_payouts
  for select to authenticated
  using (is_event_admin(event_id) and not is_event_beneficiary(event_id));

-- ============================================================
-- playlist_suggestions
-- ============================================================
alter table playlist_suggestions enable row level security;

revoke all on playlist_suggestions from anon, authenticated;
grant select on playlist_suggestions to authenticated;
grant insert (event_id, rsvp_id, spotify_track_id, track_name, artist_name) on playlist_suggestions to authenticated;
grant delete on playlist_suggestions to authenticated;

create policy "playlist_select" on playlist_suggestions
  for select to authenticated
  using (
    is_event_admin(event_id)
    or (is_event_approved_participant(event_id) and not is_block_hidden_for_me(event_id, 'playlist'))
  );

create policy "playlist_insert_own" on playlist_suggestions
  for insert to authenticated
  with check (
    is_my_rsvp(rsvp_id)
    and is_event_approved_participant(event_id)
    and not is_block_hidden_for_me(event_id, 'playlist')
  );

create policy "playlist_delete_own_or_admin" on playlist_suggestions
  for delete to authenticated
  using (is_my_rsvp(rsvp_id) or is_event_admin(event_id));

-- ============================================================
-- places_cache (cache serveur, lecture seule cote client)
-- ============================================================
alter table places_cache enable row level security;

revoke all on places_cache from anon, authenticated;
grant select on places_cache to authenticated;

create policy "places_cache_select" on places_cache
  for select to authenticated
  using (is_event_admin(event_id) or is_event_approved_participant(event_id));

-- ============================================================
-- scheduled_messages (purement interne, cron/service_role uniquement)
-- ============================================================
alter table scheduled_messages enable row level security;

revoke all on scheduled_messages from anon, authenticated;
-- Aucun grant : ni select, ni ecriture cote client. Gere entierement par le service_role (cron Vercel).

-- ============================================================
-- waitlist (inscription publique avant lancement)
-- ============================================================
alter table waitlist enable row level security;

revoke all on waitlist from anon, authenticated;
grant insert (email) on waitlist to anon, authenticated;

create policy "waitlist_insert_public" on waitlist
  for insert to anon, authenticated
  with check (true);

-- Pas de select cote client : le compteur d'inscrits et la liste sont lus par le back-office
-- via le service_role (session admin dediee, voir brief 5.8), pas par une policy RLS.

-- ============================================================
-- feature_flags (lus cote serveur pour activer/desactiver des modules)
-- ============================================================
alter table feature_flags enable row level security;

revoke all on feature_flags from anon, authenticated;
grant select on feature_flags to anon, authenticated;

create policy "feature_flags_select_public" on feature_flags
  for select to anon, authenticated
  using (true);

-- Ecriture reservee au back-office (service_role), pas de policy insert/update/delete ici.
