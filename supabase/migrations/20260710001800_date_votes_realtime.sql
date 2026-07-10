-- Retour Thomas (suite de la question "faut-il que toutes les tables se
-- refreshent") : le sondage de date doit aussi se mettre a jour en direct --
-- voter (`voteDateOption`, upsert/delete sur `date_votes`) ne touche jamais
-- `events` ni `rsvps`, donc restait invisible pour un autre participant deja
-- sur l'onglet Accueil sans F5. `date_options` n'a pas besoin du meme
-- traitement : elle n'est ecrite que par `updateEvent` (wizard "Modifier"),
-- toujours dans la MEME requete qu'une mise a jour de `events`, deja
-- realtime depuis la migration precedente.
alter publication supabase_realtime add table date_votes;
