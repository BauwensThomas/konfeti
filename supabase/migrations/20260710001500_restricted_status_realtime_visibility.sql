-- Bug reel signale par Thomas : quand un participant approuve passe a
-- "restricted" (Je ne peux pas), un AUTRE participant non-admin reste sur
-- l'onglet Personnes SANS que la personne ne disparaisse de la liste --
-- oblige a rafraichir manuellement. Fonctionne correctement pour un admin.
--
-- Cause : "rsvps_public_data_select" (20260706104902, etendue par
-- 20260710000000 pour couvrir removed/left) n'autorise que
-- status in ('approved','removed','left'). Des qu'une ligne bascule sur
-- 'restricted', elle devient invisible selon cette policy pour un abonne
-- non-admin -- Postgres Realtime evalue la RLS de la ligne APRES
-- modification avant de decider de transmettre l'evenement UPDATE a cet
-- abonne : la ligne echouant desormais la policy, l'evenement n'est jamais
-- livre, donc EventTabs ne recoit rien et ne declenche jamais
-- `router.refresh()`. Un admin, lui, voit tout via `is_event_admin` sur la
-- table brute `rsvps`, d'ou la difference de comportement observee.
--
-- Correctif : ajouter 'restricted' aux statuts visibles par cette policy.
-- Sans danger cote fuite d'information : `EventPersonnes.tsx` (requete
-- non-admin) filtre deja explicitement `.eq("status", "approved")` -- cet
-- elargissement ne sert qu'a permettre a l'evenement Realtime d'etre
-- LIVRE (declenchant un refresh qui refait la requete filtree, donc la
-- personne disparait bien de la liste), jamais a l'afficher directement.
drop policy "rsvps_public_data_select" on rsvps_public_data;

create policy "rsvps_public_data_select" on rsvps_public_data
  for select to authenticated
  using (
    status in ('approved', 'removed', 'left', 'restricted')
    and (private.is_event_admin(event_id) or private.is_event_approved_participant(event_id))
  );
