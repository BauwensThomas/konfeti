-- Nouveau flag pour les publicités AdSense (retour Thomas : "j'aimerais
-- rajouter des pub admob... on fait deja tout, mais tant que ce n'est pas
-- active, ce n'est pas visible"). Desactive par defaut : construit et
-- deployable des maintenant, sans rien afficher tant que Thomas n'a pas
-- ses vrais identifiants AdSense et n'a pas explicitement bascule le flag.
insert into feature_flags (key, enabled)
values ('ads', false)
on conflict (key) do nothing;
