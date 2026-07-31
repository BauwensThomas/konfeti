-- Bucket public pour les images des pubs maison (HouseAd.tsx, retour Thomas :
-- "les images devront etre dans le storage supabase" plutot que commitees
-- dans le depot Git) -- meme raisonnement que email-assets : contenu
-- statique uniquement, jamais d'upload utilisateur, public = true suffit.
insert into storage.buckets (id, name, public)
values ('ads-assets', 'ads-assets', true)
on conflict (id) do nothing;
