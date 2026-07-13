-- Performance Advisor : `push_subscriptions_own` utilisait `auth.uid()` brut
-- au lieu de `(select auth.uid())` -- le reste du projet a déjà cette
-- convention partout (voir 20260706110035_performance_advisor_fixes_2.sql,
-- même correctif) car Postgres réévalue `auth.uid()` à CHAQUE ligne sinon,
-- alors que la sous-requête scalaire n'est évaluée qu'une seule fois par
-- requête -- oubli de ma part en écrivant cette policy hier soir.
drop policy if exists "push_subscriptions_own" on push_subscriptions;

create policy "push_subscriptions_own" on push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
