-- Bug reel trouve en testant la proposition de sondage avec Thomas ("Une
-- erreur est survenue, reessaie." a chaque tentative). Cause exacte,
-- confirmee par un script de diagnostic reproduisant la vraie session de
-- l'invite testeur : `poll_options_propose_own` (migration precedente,
-- 20260711000100) verifie l'appartenance du sondage parent via une
-- SOUS-REQUETE ordinaire sur `polls` -- elle-meme filtree par la RLS de
-- `polls_select`, qui ne montre un sondage `pending` qu'a un admin, jamais
-- au proposant lui-meme. Un invite ne pouvait donc JAMAIS satisfaire cette
-- policy pour ses propres options, meme en proposant un sondage
-- parfaitement valide selon toutes les autres conditions (verifiees une
-- par une : is_my_rsvp, is_event_approved_participant et
-- is_block_hidden_for_me passaient tous individuellement).
--
-- Correctif : `polls_select` autorise desormais aussi le PROPOSANT a voir
-- SON PROPRE sondage en attente (jamais celui d'un autre invite). Cote UI,
-- rien ne change : `PollsListClient` ne rend la section moderation qu'a un
-- admin (`isAdmin && pendingPolls.length > 0`), donc la ligne reste
-- invisible a l'ecran pour le proposant -- seule la policy SQL en a
-- desormais besoin en interne. Le comportement voulu ("jamais visible
-- ailleurs qu'a un admin tant qu'il n'est pas traite", cote affichage) reste
-- intact.
drop policy "polls_select" on polls;
create policy "polls_select" on polls
  for select to authenticated
  using (
    private.is_event_admin(event_id)
    or (
      private.is_event_approved_participant(event_id)
      and not private.is_block_hidden_for_me(event_id, 'polls')
      and (status = 'approved' or private.is_my_rsvp(proposed_by_rsvp_id))
    )
  );
