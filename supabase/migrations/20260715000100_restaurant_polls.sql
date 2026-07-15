-- Sondage resto (brief 4.6, V1.1) : un sondage peut désormais être alimenté
-- par de vrais restaurants (Google Places) au lieu d'options 100% manuelles,
-- avec un lien d'affiliation TheFork (Awin) par option. `kind` ne sert qu'à
-- adapter l'UI du wizard (options peuplées vs texte libre) -- aucune règle
-- métier ne change côté vote/quota, `set_poll_vote` reste inchangée.
alter table polls
  add column kind text not null default 'custom' check (kind in ('custom', 'restaurant'));

-- Lien affilié TheFork (via Awin) pour une option de sondage resto, nullable
-- (une option de sondage 'custom' n'en a jamais). La construction de l'URL
-- (awin cread.php + IDs Awin) vit côté application (src/lib/awin.ts), jamais
-- en base -- aucune contrainte de forme ici.
alter table poll_options
  add column external_url text;
