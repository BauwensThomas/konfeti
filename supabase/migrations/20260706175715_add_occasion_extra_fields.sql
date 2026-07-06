-- Champs specifiques a l'occasion "cremaillere" (qui recoit, potentiellement plusieurs
-- personnes) et "EVG/EVJF" (le nom du futur marie ou de la future mariee), sur le meme
-- principe que birthday_person/birthday_date/birthday_age deja en place.

alter table events add column housewarming_hosts text[];
alter table events add column bachelor_person text;
