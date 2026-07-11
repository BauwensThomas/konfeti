-- Bug reel signale par Thomas : "j'ai un utilisateur qui a dit qu'il allait
-- ramener 3 litres de vodka, apres il a marque qu'il venait pas et pourtant
-- j'ai toujours son nom avec 3 litres de vodka."
--
-- `leave_or_remove_participant` supprime deja `bring_claims` quand un
-- participant quitte/est retire (voir participant_lifecycle.sql, "1.
-- Nettoyage des engagements"), mais `update_my_answer` (le chemin "Je ne
-- peux pas", answer='no' -> status='restricted') n'avait jamais ce meme
-- nettoyage -- un engagement pris avant restait affiche tel quel, laissant
-- croire a tort que la personne apportera quand meme l'item.
--
-- Retour Thomas, suite logique : une PROPOSITION encore en attente de
-- moderation ("qui apporte quoi") n'a de sens que parce que le proposant
-- comptait venir -- si son statut passe a restricted (via 'no'), la
-- proposition doit disparaitre elle aussi, pas juste sa reclamation sur un
-- item deja approuve. Un item deja APPROUVE (donc devenu un vrai besoin de
-- la fete, pas juste une suggestion personnelle) n'est en revanche jamais
-- supprime ici -- seul son propre engagement dessus l'est (ci-dessus).
create or replace function update_my_answer(p_rsvp_id uuid, p_answer text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
begin
  if p_answer not in ('yes', 'maybe', 'no') then
    raise exception 'invalid answer: %', p_answer;
  end if;

  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select status into v_status from rsvps where id = p_rsvp_id;

  if p_answer = 'no' then
    -- Meme principe que leave_or_remove_participant : les jauges se
    -- recalculent automatiquement par comptage des lignes restantes.
    delete from bring_claims where rsvp_id = p_rsvp_id;
    -- Propositions encore en attente de moderation : supprimees avec la
    -- meme logique (jamais les items DEJA approuves, devenus un besoin
    -- generique de la fete, independant de qui les a proposes a l'origine).
    delete from bring_items where proposed_by_rsvp_id = p_rsvp_id and status = 'pending';
    update rsvps set answer = p_answer, status = 'restricted', updated_at = now() where id = p_rsvp_id;
  elsif v_status = 'restricted' then
    update rsvps set
      answer = p_answer,
      status = 'pending',
      wants_pot_access = false,
      pot_access_granted = false,
      updated_at = now()
    where id = p_rsvp_id;
  else
    update rsvps set answer = p_answer, updated_at = now() where id = p_rsvp_id;
  end if;
end;
$$;
