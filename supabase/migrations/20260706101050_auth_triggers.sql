-- Cree automatiquement une ligne profiles a la creation d'un compte Supabase Auth
-- (email/Google reel OU session anonyme pour les invites "code d'acces", voir doc/ARCHITECTURE.md).
-- Le prenom est complete a partir des metadonnees Google si disponibles ; le reste
-- (telephone, sexe) est rempli ensuite par l'app (brief : "completion du profil").

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Touche updated_at automatiquement sur rsvps a chaque modification
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rsvps_touch_updated_at
  before update on rsvps
  for each row execute function touch_updated_at();
