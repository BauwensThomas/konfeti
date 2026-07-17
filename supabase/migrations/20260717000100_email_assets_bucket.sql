-- Retour Thomas : les images des emails (mascotte + icônes réseaux sociaux)
-- pointaient vers konfeti.belgacai.com, qui ne répond pas encore (site pas
-- déployé) -- cassées aussi bien dans la prévisualisation Supabase que dans
-- un vrai envoi de test avant le lancement. Bucket public dédié : le projet
-- Supabase, lui, est déjà en ligne dès maintenant, contrairement au site.
-- Contenu statique uniquement (jamais d'upload utilisateur ici, contrairement
-- à `event-photos`) -- pas besoin de policy RLS particulière, `public = true`
-- suffit à autoriser la lecture anonyme via l'URL publique du Storage.
insert into storage.buckets (id, name, public)
values ('email-assets', 'email-assets', true)
on conflict (id) do nothing;
