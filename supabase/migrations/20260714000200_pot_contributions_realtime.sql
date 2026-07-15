-- Bug réel signalé par Thomas ("pas de refresh automatiquement sur mon
-- site") : contrairement à bring_items/polls/rsvps, `pot_contributions` et
-- `pot_payouts` n'avaient jamais été ajoutées à la publication Realtime --
-- le webhook Stripe met bien la ligne à jour en base, mais personne ne le
-- voit sans rafraîchir la page manuellement. Même pattern que les autres
-- tables (voir 20260710002300_bring_units_and_realtime.sql).
alter publication supabase_realtime add table pot_contributions, pot_payouts;
