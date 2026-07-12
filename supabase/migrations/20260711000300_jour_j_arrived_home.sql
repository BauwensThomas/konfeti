-- Mode Jour J (brief 4.11). `rsvps.checked_in_at` existe deja depuis la
-- Phase 1 (deja accorde en ecriture a `authenticated`, deja couvert par
-- `rsvps_update_own`, deja synchronise dans `rsvps_public_data`) : aucun
-- changement necessaire pour l'arrivee elle-meme.
--
-- Retour Thomas, propose en cours de plan : "je suis bien rentre", symetrique
-- de "je suis arrive" pour la fin de soiree ("ca evite d'attendre un sms").
-- Contrairement au compteur d'arrivees (reserve aux admins, conforme au
-- brief), cette checklist est visible de TOUT LE MONDE ("chaque personne
-- coche sa case... et tout le monde le voit") -- reassurance collective,
-- pas un outil de logistique admin. Nouvelle colonne, aucune ne preexiste.
alter table rsvps add column arrived_home_at timestamptz;

-- Auto-service : le participant pose lui-meme ce champ sur SA ligne, comme
-- checked_in_at/wants_pot_access/answer... (rsvps_update_own couvre deja
-- "sa propre ligne", il ne manquait que le grant sur cette colonne precise).
grant update (arrived_home_at) on rsvps to authenticated;

-- Visible de TOUT LE MONDE (retour Thomas), pas seulement les admins :
-- ajoutee a la table miroir deja utilisee pour les infos partagees
-- (prenom, avatar... voir 20260706104902_replace_privacy_views_with_mirror_tables.sql).
alter table rsvps_public_data add column arrived_home_at timestamptz;

-- sync_rsvps_public_data() recreee pour inclure arrived_home_at, meme geste
-- que checked_in_at deja present dans cette fonction -- corps repris a
-- l'identique sinon.
create or replace function sync_rsvps_public_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from rsvps_public_data where id = old.id;
    return old;
  end if;

  insert into rsvps_public_data (
    id, event_id, first_name, last_initial, avatar_kind, avatar_value,
    status, role, answer, is_designated_driver, checked_in_at, arrived_home_at, companions_count
  )
  values (
    new.id, new.event_id, new.first_name, left(new.last_name, 1), new.avatar_kind, new.avatar_value,
    new.status, new.role, new.answer, new.is_designated_driver, new.checked_in_at, new.arrived_home_at,
    (select count(*) from companions c where c.rsvp_id = new.id)
  )
  on conflict (id) do update set
    event_id = excluded.event_id,
    first_name = excluded.first_name,
    last_initial = excluded.last_initial,
    avatar_kind = excluded.avatar_kind,
    avatar_value = excluded.avatar_value,
    status = excluded.status,
    role = excluded.role,
    answer = excluded.answer,
    is_designated_driver = excluded.is_designated_driver,
    checked_in_at = excluded.checked_in_at,
    arrived_home_at = excluded.arrived_home_at,
    companions_count = excluded.companions_count;

  return new;
end;
$$;
