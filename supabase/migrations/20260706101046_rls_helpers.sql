-- Fonctions utilitaires pour les policies RLS.
-- security definer + search_path fixe : evite la recursion RLS et le detournement de search_path
-- (voir checklist securite Supabase).

create or replace function is_event_host(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from events
    where id = p_event_id
      and host_id = auth.uid()
  );
$$;

create or replace function my_rsvp_status(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from rsvps
  where event_id = p_event_id
    and profile_id = auth.uid()
  limit 1;
$$;

create or replace function my_rsvp_role(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from rsvps
  where event_id = p_event_id
    and profile_id = auth.uid()
    and status = 'approved'
  limit 1;
$$;

create or replace function is_event_admin(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_event_host(p_event_id) or my_rsvp_role(p_event_id) = 'admin';
$$;

create or replace function is_event_approved_participant(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select my_rsvp_status(p_event_id) = 'approved' or is_event_host(p_event_id);
$$;

create or replace function is_event_restricted_participant(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select my_rsvp_status(p_event_id) = 'restricted';
$$;

create or replace function is_event_beneficiary(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select my_rsvp_role(p_event_id) = 'beneficiary';
$$;

-- true si le bloc doit etre cache pour l'appelant (il est le beneficiaire ET ce bloc est dans sa liste de blocs caches)
create or replace function is_block_hidden_for_me(p_event_id uuid, p_block text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_event_beneficiary(p_event_id)
    and exists (
      select 1 from events
      where id = p_event_id
        and p_block = any(beneficiary_hidden_blocks)
    );
$$;

-- proprietaire d'une ligne rsvp (pour les policies d'ecriture "un participant ne modifie que SES lignes")
create or replace function is_my_rsvp(p_rsvp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from rsvps
    where id = p_rsvp_id
      and profile_id = auth.uid()
  );
$$;
