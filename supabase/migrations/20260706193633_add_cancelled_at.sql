-- Horodatage de l'annulation d'un événement (demande de Thomas : suppression
-- hybride, l'événement annulé reste récupérable 90 jours avant purge
-- définitive par un job planifié). Sans cette date, impossible de savoir
-- depuis quand un événement est annulé pour décider s'il doit être purgé.

alter table events add column cancelled_at timestamptz;
