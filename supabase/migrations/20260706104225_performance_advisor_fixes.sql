-- Corrections suite au Performance Advisor de Supabase.

-- 1. Colonnes de cle etrangere sans index (ralentit les jointures/suppressions en cascade)
create index rsvps_approved_by_idx on rsvps(approved_by);
create index messages_reply_to_idx on messages(reply_to);
create index scheduled_messages_event_id_idx on scheduled_messages(event_id);

-- 2. bring_claims avait 2 policies UPDATE permissives pour "authenticated" (une pour le
-- participant sur sa propre ligne, une pour l'admin qui coche "apporte"), evaluees en double
-- a chaque requete. Fusionnees en une seule policy (le resultat d'autorisation est identique :
-- Postgres combine de toute facon plusieurs policies permissives du meme type avec un OR ;
-- la distinction "le participant ne peut modifier que quantity, l'admin que brought" reste
-- entierement geree par les grants de colonnes existants, inchanges).
drop policy "bring_claims_update_own" on bring_claims;
drop policy "bring_claims_admin_checkin" on bring_claims;

create policy "bring_claims_update" on bring_claims
  for update to authenticated
  using (
    is_my_rsvp(rsvp_id)
    or exists (select 1 from bring_items bi where bi.id = item_id and is_event_admin(bi.event_id))
  )
  with check (
    is_my_rsvp(rsvp_id)
    or exists (select 1 from bring_items bi where bi.id = item_id and is_event_admin(bi.event_id))
  );
