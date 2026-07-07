-- Le guest_code (recuperation cross-device, brief 1.2) n'avait que 8 mots x
-- 9000 combinaisons possibles (4 chiffres) : environ 72 000 codes au total,
-- enumerables en quelques minutes. Un code devine permettrait de reassigner
-- la participation d'une autre personne a sa propre session (redeem_guest_code) :
-- plus grave qu'une simple fuite d'info, un vrai risque de detournement de
-- compte. Suffixe alphanumerique aleatoire (6 caracteres, sans 0/O/1/I
-- ambigus) plutot qu'un nombre a 4 chiffres : 32^6 ≈ 1,07 milliard de
-- combinaisons par mot, largement suffisant vu que le code reste a saisir a
-- la main (pas trop long non plus).
create or replace function generate_guest_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  words text[] := array['INVITE', 'GUEST', 'COPAIN', 'VOISIN', 'AMI', 'TEAM', 'CREW', 'GANG'];
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_suffix text;
  i int;
begin
  loop
    v_suffix := '';
    for i in 1..6 loop
      v_suffix := v_suffix || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    v_code := words[1 + floor(random() * array_length(words, 1))::int] || '-' || v_suffix;
    exit when not exists (select 1 from rsvps where guest_code = v_code);
  end loop;
  return v_code;
end;
$$;
