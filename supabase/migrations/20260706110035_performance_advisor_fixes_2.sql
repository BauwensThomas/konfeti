-- Suite du Performance Advisor.

-- ============================================================
-- 1. auth_rls_initplan : auth.uid() appele directement dans une policy est reevalue a
-- chaque ligne. En l'enveloppant dans (select auth.uid()), Postgres l'evalue une seule fois
-- par requete (initplan). Comportement identique, juste plus rapide a grande echelle.
-- ============================================================
alter policy "profiles_select_own" on profiles
  using (id = (select auth.uid()));

alter policy "profiles_insert_own" on profiles
  with check (id = (select auth.uid()));

alter policy "profiles_update_own" on profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "events_insert_as_host" on events
  with check (host_id = (select auth.uid()));

alter policy "rsvps_select_own_or_admin" on rsvps
  using (profile_id = (select auth.uid()) or private.is_event_admin(event_id));

alter policy "rsvps_insert_self" on rsvps
  with check (profile_id = (select auth.uid()));

alter policy "rsvps_update_own" on rsvps
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Meme optimisation a l'interieur des fonctions utilitaires qui appellent auth.uid()
-- directement (le linter ne voit pas l'interieur des fonctions, mais le principe est identique)
create or replace function private.is_event_host(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from events
    where id = p_event_id
      and host_id = (select auth.uid())
  );
$$;

create or replace function private.my_rsvp_status(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = private, public
as $$
  select status from rsvps
  where event_id = p_event_id
    and profile_id = (select auth.uid())
  limit 1;
$$;

create or replace function private.my_rsvp_role(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = private, public
as $$
  select role from rsvps
  where event_id = p_event_id
    and profile_id = (select auth.uid())
    and status = 'approved'
  limit 1;
$$;

create or replace function private.is_my_rsvp(p_rsvp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1 from rsvps
    where id = p_rsvp_id
      and profile_id = (select auth.uid())
  );
$$;

-- ============================================================
-- 2. multiple_permissive_policies : ces 8 tables avaient une policy "_select" dediee ET une
-- policy "for all" (qui couvre donc AUSSI select) pour le meme role authenticated -> les deux
-- sont evaluees a chaque lecture. On restreint les policies "for all" a insert/update/delete
-- uniquement : le select est deja entierement couvert par la policy "_select" existante,
-- comportement d'autorisation inchange.
-- ============================================================
drop policy "companions_write_own" on companions;
create policy "companions_write_own" on companions
  for insert
  to authenticated
  with check (private.is_my_rsvp(rsvp_id));
create policy "companions_update_own" on companions
  for update to authenticated
  using (private.is_my_rsvp(rsvp_id))
  with check (private.is_my_rsvp(rsvp_id));
create policy "companions_delete_own" on companions
  for delete to authenticated
  using (private.is_my_rsvp(rsvp_id));

drop policy "date_options_write_admin" on date_options;
create policy "date_options_write_admin" on date_options
  for insert to authenticated
  with check (private.is_event_admin(event_id));
create policy "date_options_update_admin" on date_options
  for update to authenticated
  using (private.is_event_admin(event_id))
  with check (private.is_event_admin(event_id));
create policy "date_options_delete_admin" on date_options
  for delete to authenticated
  using (private.is_event_admin(event_id));

drop policy "date_votes_write_own" on date_votes;
create policy "date_votes_write_own" on date_votes
  for insert to authenticated
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (select 1 from date_options d where d.id = option_id and private.is_event_approved_participant(d.event_id))
  );
create policy "date_votes_delete_own" on date_votes
  for delete to authenticated
  using (private.is_my_rsvp(rsvp_id));

drop policy "polls_write_admin" on polls;
create policy "polls_write_admin" on polls
  for insert to authenticated
  with check (private.is_event_admin(event_id));
create policy "polls_update_admin" on polls
  for update to authenticated
  using (private.is_event_admin(event_id))
  with check (private.is_event_admin(event_id));
create policy "polls_delete_admin" on polls
  for delete to authenticated
  using (private.is_event_admin(event_id));

drop policy "poll_options_write_admin" on poll_options;
create policy "poll_options_write_admin" on poll_options
  for insert to authenticated
  with check (exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id)));
create policy "poll_options_update_admin" on poll_options
  for update to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id)))
  with check (exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id)));
create policy "poll_options_delete_admin" on poll_options
  for delete to authenticated
  using (exists (select 1 from polls p where p.id = poll_id and private.is_event_admin(p.event_id)));

drop policy "poll_votes_write_own" on poll_votes;
create policy "poll_votes_write_own" on poll_votes
  for insert to authenticated
  with check (
    private.is_my_rsvp(rsvp_id)
    and exists (
      select 1 from poll_options po join polls p on p.id = po.poll_id
      where po.id = option_id
        and private.is_event_approved_participant(p.event_id)
        and not private.is_block_hidden_for_me(p.event_id, 'polls')
    )
  );
create policy "poll_votes_delete_own" on poll_votes
  for delete to authenticated
  using (private.is_my_rsvp(rsvp_id));

drop policy "bring_items_write_admin" on bring_items;
create policy "bring_items_write_admin" on bring_items
  for insert to authenticated
  with check (private.is_event_admin(event_id));
create policy "bring_items_update_admin" on bring_items
  for update to authenticated
  using (private.is_event_admin(event_id))
  with check (private.is_event_admin(event_id));
create policy "bring_items_delete_admin" on bring_items
  for delete to authenticated
  using (private.is_event_admin(event_id));

drop policy "message_reactions_write_own" on message_reactions;
create policy "message_reactions_write_own" on message_reactions
  for insert to authenticated
  with check (private.is_my_rsvp(rsvp_id));
create policy "message_reactions_delete_own" on message_reactions
  for delete to authenticated
  using (private.is_my_rsvp(rsvp_id));
