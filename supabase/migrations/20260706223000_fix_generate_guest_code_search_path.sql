-- Correctif Security Advisor : generate_guest_code() n'avait pas de
-- search_path fixe (contrairement aux autres fonctions du projet), ce qui la
-- rend vulnerable a un search_path mutable (une session pourrait faire
-- pointer "rsvps" vers une autre table via un schema shadow). Alignee sur la
-- convention du reste du projet (search_path = public, elle ne lit que la
-- table rsvps du schema public).
create or replace function generate_guest_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  words text[] := array['INVITE', 'GUEST', 'COPAIN', 'VOISIN', 'AMI', 'TEAM', 'CREW', 'GANG'];
  v_code text;
begin
  loop
    v_code := words[1 + floor(random() * array_length(words, 1))::int]
      || '-' || (1000 + floor(random() * 9000))::int;
    exit when not exists (select 1 from rsvps where guest_code = v_code);
  end loop;
  return v_code;
end;
$$;
