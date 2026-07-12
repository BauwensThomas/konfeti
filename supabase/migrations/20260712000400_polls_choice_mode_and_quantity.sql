-- Sondages "choix unique" avec quota par personne (retour Thomas) : "je sais
-- voter pour les 3... j'ai le droit qu'à un menu" + "si j'ai des
-- accompagnants, je ne sais pas avoir 4 menus moules frites". Jusqu'ici tout
-- sondage était implicitement "choix multiple" et un vote valait toujours
-- pour 1 personne, quel que soit le nombre d'accompagnants du votant.
--
-- Approche retenue (choix explicite de Thomas parmi 3 options proposées) :
-- "quota par personne" -- un sondage 'single' donne à chaque rsvp un budget
-- de "1 + ses accompagnants" votes à répartir librement entre les options
-- (ex: 4 sur "moules-frites", ou 2+2 si le groupe se partage), via une
-- quantité par option plutôt qu'un modèle "un accompagnant nommé = une
-- ligne de vote" (plus simple, et la plupart des accompagnants n'ont même
-- pas de prénom renseigné). Un sondage 'multiple' garde le comportement
-- historique (cases à cocher, quantité toujours 1).

alter table polls
  add column choice_mode text not null default 'multiple' check (choice_mode in ('single', 'multiple'));

alter table poll_votes
  add column quantity int not null default 1 check (quantity > 0);

-- Toute la logique de quota vit ici (jamais côté client) : un client qui
-- mentirait sur la quantité se ferait de toute façon rejeter par cette
-- fonction, seul chemin d'écriture désormais utilisé par `setPollVote`
-- (actions/polls.ts) -- même principe que `update_my_answer`/
-- `create_own_rsvp`, la vraie règle métier est en SQL, pas en JS.
create or replace function set_poll_vote(p_rsvp_id uuid, p_option_id uuid, p_quantity int)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_poll_id uuid;
  v_choice_mode text;
  v_companions_count int;
  v_budget int;
  v_other_total int;
begin
  if not is_my_rsvp(p_rsvp_id) then
    raise exception 'not authorized';
  end if;

  select po.poll_id, p.choice_mode into v_poll_id, v_choice_mode
  from poll_options po
  join polls p on p.id = po.poll_id
  where po.id = p_option_id;

  if v_poll_id is null then
    raise exception 'invalid option';
  end if;

  if p_quantity <= 0 then
    delete from poll_votes where option_id = p_option_id and rsvp_id = p_rsvp_id;
    return;
  end if;

  if v_choice_mode = 'multiple' then
    if p_quantity <> 1 then
      raise exception 'invalid quantity for multiple choice poll';
    end if;
    insert into poll_votes (option_id, rsvp_id, quantity)
    values (p_option_id, p_rsvp_id, 1)
    on conflict (option_id, rsvp_id) do update set quantity = 1;
    return;
  end if;

  -- choix unique : quota partagé sur tout le sondage = 1 (le votant) + ses
  -- accompagnants, réparti librement entre les options de CE sondage.
  select count(*) into v_companions_count from companions where rsvp_id = p_rsvp_id;
  v_budget := 1 + v_companions_count;

  select coalesce(sum(pv.quantity), 0) into v_other_total
  from poll_votes pv
  join poll_options po on po.id = pv.option_id
  where po.poll_id = v_poll_id and pv.rsvp_id = p_rsvp_id and pv.option_id <> p_option_id;

  if v_other_total + p_quantity > v_budget then
    raise exception 'quota exceeded';
  end if;

  insert into poll_votes (option_id, rsvp_id, quantity)
  values (p_option_id, p_rsvp_id, p_quantity)
  on conflict (option_id, rsvp_id) do update set quantity = excluded.quantity;
end;
$$;

revoke execute on function set_poll_vote(uuid, uuid, int) from public, anon;
grant execute on function set_poll_vote(uuid, uuid, int) to authenticated;
