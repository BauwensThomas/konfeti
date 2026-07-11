-- Sondages (brief : "Sondage(s) optionnel(s)", ecran 4 + onglet Participer).
-- `polls`/`poll_options`/`poll_votes` existent en base depuis la Phase 1,
-- jamais aucune UI jusqu'ici -- meme situation que "qui apporte quoi" avant
-- son propre chantier (20260710002400).
--
-- Retour Thomas : "les autres utilisateurs doivent pouvoir [proposer] un
-- sondage et doit etre accepter par les admins ou les organisateurs, la
-- meme organisation que pour qui rapporte quoi" -- meme statut
-- pending/approved, meme modele de proposition que bring_items.
alter table polls
  add column status text not null default 'approved' check (status in ('pending', 'approved'));

alter table polls
  add column proposed_by_rsvp_id uuid references rsvps(id) on delete set null;

-- Realtime (EventTabs.tsx, canal dedie event-{id}-polls) : ces 3 tables
-- n'etaient encore jamais ajoutees a la publication, meme etape que
-- bring_items/bring_claims (20260710002300_bring_units_and_realtime.sql).
alter publication supabase_realtime add table polls, poll_options, poll_votes;

-- Non-admin limite aux sondages approuves (+ masquage beneficiaire deja en
-- place) ; un admin voit tout, y compris en attente, pour pouvoir moderer.
-- Prefixe private. obligatoire ici : policy RECREEE, contrairement a
-- l'originale (creee avant le deplacement des fonctions RLS vers le schema
-- private, donc resolue a son OID -- piege deja rencontre deux fois ce
-- mois-ci, voir DECISIONS.md).
drop policy "polls_select" on polls;
create policy "polls_select" on polls
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (
      private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'polls')
      and status = 'approved'
    )
  );

-- Meme filtre applique aux options d'un sondage en attente : sinon un
-- non-admin verrait les options d'un sondage qu'il ne peut pas encore voir
-- via `polls_select`. Recreee pour la meme raison de prefixe.
drop policy "poll_options_select" on poll_options;
create policy "poll_options_select" on poll_options
  for select to authenticated
  using (
    exists (
      select 1 from polls p
      where p.id = poll_id
        and (
          private.is_event_admin(p.event_id)
          or (
            private.is_event_approved_participant(p.event_id)
            and not private.is_block_hidden_for_me(p.event_id, 'polls')
            and p.status = 'approved'
          )
        )
    )
  );

-- Un participant approuve (non masque du bloc 'polls') peut proposer un
-- sondage, TOUJOURS en 'pending', TOUJOURS avec son propre rsvp_id (jamais
-- approuve directement -- `polls_write_admin`/`update_admin`/`delete_admin`,
-- deja en place, restent seules maitresses du passage a 'approved' ou du
-- refus, aucun changement necessaire la-dessus).
create policy "polls_propose_own" on polls
  for insert to authenticated
  with check (
    status = 'pending'
    and private.is_my_rsvp(proposed_by_rsvp_id)
    and private.is_event_approved_participant(event_id)
    and not private.is_block_hidden_for_me(event_id, 'polls')
  );

-- Un sondage propose a besoin d'au moins 2 options des sa creation : le
-- proposant doit pouvoir inserer les options de SON PROPRE sondage encore
-- en attente (jamais celles d'un sondage deja approuve ou appartenant a
-- quelqu'un d'autre).
create policy "poll_options_propose_own" on poll_options
  for insert to authenticated
  with check (
    exists (
      select 1 from polls p
      where p.id = poll_id
        and p.status = 'pending'
        and private.is_my_rsvp(p.proposed_by_rsvp_id)
    )
  );

-- Retour Thomas : "le vote doit disparaitre si la personne part ou faire
-- disparaitre la demande en cours si l'utilisateur part avant que ce soit
-- active" -- confirme etendu aux DEUX cas (quitter/etre retire ET "Je ne
-- peux pas"), meme regle que le correctif bring_claims de ce matin
-- (20260710002600).
create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status into v_status from rsvps where id = p_rsvp_id;

  if p_answer = 'no' then
    delete from bring_claims where rsvp_id = p_rsvp_id;
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    delete from poll_votes where rsvp_id = p_rsvp_id;
    delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    update rsvps set answer = p_answer, status = 'restricted', updated_at = now() where id = p_rsvp_id;
  elsif v_status = 'restricted' then
    update rsvps set
      answer = p_answer,
      status = 'pending',
      wants_pot_access = false,
      pot_access_granted = false,
      updated_at = now()
    where id = p_rsvp_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;

-- `poll_votes` etait deja nettoyee ici depuis la Phase 1 ; seule la
-- proposition de sondage en attente est nouvelle.
create or replace function leave_or_remove_participant(p_rsvp_id uuid, p_new_status text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
begin
  if p_new_status not in ('removed', 'left') then
    raise exception 'invalid status: %', p_new_status;
  end if;

  select event_id into v_event_id from rsvps where id = p_rsvp_id;
  if v_event_id is null then
    raise exception 'rsvp not found';
  end if;

  if exists (
    select 1 from rsvps r
    join events e on e.id = r.event_id
    where r.id = p_rsvp_id and r.profile_id = e.host_id
  ) then
    raise exception 'the organizer cannot leave or be removed, transfer the organization first';
  end if;

  if is_my_rsvp(p_rsvp_id) then
    if p_new_status <> 'left' then
      raise exception 'a participant leaving must use status left';
    end if;
  elsif is_event_admin(v_event_id) then
    if p_new_status <> 'removed' then
      raise exception 'an admin removing a participant must use status removed';
    end if;
  else
    raise exception 'not authorized';
  end if;

  -- 1. Nettoyage des engagements (les jauges/ratios se recalculent automatiquement,
  --    puisqu'ils sont derives par comptage des lignes restantes)
  delete from poll_votes where rsvp_id = p_rsvp_id;
  delete from polls where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from date_votes where rsvp_id = p_rsvp_id;
  delete from bring_claims where rsvp_id = p_rsvp_id;
  delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
  delete from companions where rsvp_id = p_rsvp_id;
  delete from playlist_suggestions where rsvp_id = p_rsvp_id and added_to_playlist = false;

  -- 2. Anonymisation de l'identite (les messages et pot_contributions restent, "Anonyme"
  --    via la jointure -- voir rsvps_public qui affichera first_name = null).
  --    profile_id N'EST PLUS nullifie (voir commentaire de migration ci-dessus) :
  --    le lien avec le compte reel reste pour permettre une reactivation propre
  --    si la personne revient un jour sur cet evenement.
  update rsvps set
    is_anonymized = true,
    status = p_new_status,
    first_name = null,
    last_name = null,
    phone = null,
    guest_contact = null,
    avatar_kind = 'preset',
    avatar_value = 'anonymous',
    guest_code = null,
    updated_at = now()
  where id = p_rsvp_id;

  -- 3. La cagnotte n'est jamais remboursee : pot_contributions n'est pas touchee ici (brief 1.5)
end;
$$;
