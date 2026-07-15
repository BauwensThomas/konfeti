-- Phase 7 (cagnotte) : partie paiement réelle. Le squelette (schéma/RLS/
-- wizard/accès "cagnotte seule") existe déjà depuis la Phase 1 -- cette
-- migration ajoute uniquement ce qui manquait pour brancher Stripe Connect
-- Express dessus (onboarding, Checkout, webhooks, fermeture automatique).

-- ============================================================
-- pot_contributions : traçabilité de la session Checkout + statuts manquants
-- ============================================================
alter table pot_contributions add column if not exists stripe_checkout_session_id text unique;
alter table pot_contributions add column if not exists updated_at timestamptz not null default now();

alter table pot_contributions drop constraint if exists pot_contributions_status_check;
alter table pot_contributions add constraint pot_contributions_status_check
  check (status in ('pending', 'succeeded', 'failed', 'canceled'));

-- ============================================================
-- profiles : statut d'onboarding Stripe Connect (évite de réinterroger
-- l'API Stripe à chaque affichage pour savoir si l'organisateur peut
-- recevoir des paiements -- synchronisé par le webhook `account.updated`)
-- ============================================================
alter table profiles add column if not exists stripe_onboarding_complete boolean not null default false;

-- ============================================================
-- events : fermeture de la cagnotte (pot_close_at_goal, une fois l'objectif
-- atteint) -- distinct de pot_enabled : une cagnotte fermée reste
-- consultable (historique des contributions), juste plus de nouvelle
-- contribution possible. Réversible par un admin comme le reste du projet.
-- ============================================================
alter table events add column if not exists pot_closed_at timestamptz;

-- ============================================================
-- Transfert de la cagnotte (brief 4.8) : l'admin qui la porte (pot_owner)
-- change de main -- security definer, même pattern que
-- transfer_event_host. Ne touche jamais stripe_onboarding_complete : c'est
-- un statut par PROFIL (un compte Stripe Connect par utilisateur), pas par
-- événement -- si le nouveau porteur a déjà un compte Stripe fonctionnel
-- (porte déjà la cagnotte d'un autre événement), inutile de refaire
-- l'onboarding.
create function transfer_pot_ownership(p_event_id uuid, p_new_owner_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_new_owner_status text;
  v_new_owner_role text;
begin
  if not is_event_admin(p_event_id) then
    raise exception 'not authorized';
  end if;

  select status, role into v_new_owner_status, v_new_owner_role
  from rsvps
  where event_id = p_event_id and profile_id = p_new_owner_profile_id;

  if v_new_owner_status is distinct from 'approved' or v_new_owner_role not in ('admin') then
    if not exists (select 1 from events where id = p_event_id and host_id = p_new_owner_profile_id) then
      raise exception 'new pot owner must be an approved admin or the organizer';
    end if;
  end if;

  update events set pot_owner = p_new_owner_profile_id where id = p_event_id;
end;
$$;

revoke execute on function transfer_pot_ownership(uuid, uuid) from public, anon;
grant execute on function transfer_pot_ownership(uuid, uuid) to authenticated;

-- ============================================================
-- Garde-fou suppression de compte (brief 4.8) : `delete_own_account`
-- vidait déjà silencieusement `pot_owner` en toute fin de fonction (ligne
-- "update events set pot_owner = null where pot_owner = v_uid"), SANS
-- jamais vérifier qu'aucune cagnotte active n'en dépendait -- une cagnotte
-- ouverte se serait retrouvée orpheline, plus aucune contribution ne
-- pouvant être routée. Bloqué désormais tant qu'une cagnotte ACTIVE
-- (pot_enabled ET pas encore fermée) dépend de ce compte -- message clair
-- côté action serveur, cohérent avec le blocage "encore organisateur" déjà
-- en place juste au-dessus. Le solde Stripe réel (autre condition du
-- brief : "et solde Stripe à zéro") ne peut pas être vérifié en SQL pur --
-- cette vérification-là se fait côté action serveur (appel API Stripe)
-- AVANT d'appeler cette fonction, jamais dans le RPC lui-même.
create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_rsvp record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from events where host_id = v_uid) then
    raise exception 'still hosting events, transfer organization first';
  end if;

  if exists (
    select 1 from events
    where pot_owner = v_uid and pot_enabled = true and pot_closed_at is null
  ) then
    raise exception 'still owns an active pot, transfer or close it first';
  end if;

  for v_rsvp in
    select id from rsvps where profile_id = v_uid and status not in ('left', 'removed')
  loop
    delete from poll_votes where rsvp_id = v_rsvp.id;
    delete from polls where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from date_votes where rsvp_id = v_rsvp.id;
    delete from bring_claims where rsvp_id = v_rsvp.id;
    delete from bring_items where proposed_by_rsvp_id = v_rsvp.id and status = 'pending';
    delete from companions where rsvp_id = v_rsvp.id;
    delete from playlist_suggestions where rsvp_id = v_rsvp.id and added_to_playlist = false;

    update rsvps set
      is_anonymized = true,
      status = 'left',
      first_name = null,
      last_name = null,
      phone = null,
      guest_contact = null,
      avatar_kind = 'preset',
      avatar_value = 'anonymous',
      profile_id = null,
      updated_at = now()
    where id = v_rsvp.id;
  end loop;

  update rsvps set profile_id = null where profile_id = v_uid;
  update rsvps set approved_by = null where approved_by = v_uid;
  -- Sans risque ici : le garde-fou plus haut a déjà bloqué toute cagnotte
  -- encore ACTIVE -- une référence `pot_owner` restante à ce stade ne peut
  -- venir que d'une cagnotte déjà fermée, sans lien de routage à préserver.
  update events set pot_owner = null where pot_owner = v_uid;
end;
$$;
