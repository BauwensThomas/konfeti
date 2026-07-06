-- Thomas a précisé juste après la migration précédente que la photo doit être
-- disponible pour toutes les occasions (pas seulement l'anniversaire), affichée
-- en rond dans la bannière de l'événement. Renomme la colonne en conséquence
-- (le stockage/bucket "event-photos" restait déjà générique, aucun changement
-- nécessaire de ce côté).

alter table events rename column birthday_photo_path to cover_photo_path;
