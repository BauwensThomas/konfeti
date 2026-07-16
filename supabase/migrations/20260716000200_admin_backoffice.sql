-- Back-office /admin (Phase 9, brief 5.8) : trace des passages des scripts
-- planifiés (crons Vercel, webhook Stripe), pour le panneau "santé" -- rien
-- n'est persisté jusqu'ici (les crons renvoient juste un JSON à Vercel).
-- Service-role uniquement : jamais lu ni écrit par un client normal.
create table admin_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  level text not null check (level in ('info', 'error')),
  message text not null,
  created_at timestamptz not null default now()
);
alter table admin_logs enable row level security;
revoke all on admin_logs from anon, authenticated;
-- Aucune policy select/insert pour anon/authenticated : accès service-role
-- uniquement (RLS activée sans aucun grant client, même précaution que les
-- autres tables réservées au back-office).

-- Nettoyage : résidu de la Phase 8 (Playlist Spotify), construite puis
-- entièrement retirée -- voir DECISIONS.md.
delete from feature_flags where key = 'spotify';
