-- Affinage produit (Thomas, juste apres avoir teste le durcissement
-- precedent) : plutot que de presenter un bouton "Autoriser la cagnotte" pour
-- CHAQUE personne "je ne peux pas" (la plupart ne se soucient pas du tout de
-- la cagnotte), on demande d'abord au participant restreint lui-meme s'il
-- veut quand meme y participer. Seul un "oui" explicite de sa part cree une
-- vraie demande visible cote admin ; sinon il reste juste dans la liste "Ne
-- peuvent pas venir", sans aucune information ni action liee a la cagnotte.

alter table rsvps add column wants_pot_access boolean not null default false;

-- Auto-service : le participant pose lui-meme ce drapeau sur SA ligne, comme
-- pour answer/avatar_kind... (rsvps_update_own couvre deja "sa propre ligne",
-- il ne manquait que le grant sur cette colonne precise).
grant update (wants_pot_access) on rsvps to authenticated;
