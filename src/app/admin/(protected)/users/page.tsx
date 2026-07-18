import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { Card } from "@/components/ui/Card";
import { fetchAllPages } from "@/lib/pagination";

function serviceRoleClient() {
  return createServiceRoleClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type ProfileRow = { created_at: string };

// Nombre d'utilisateurs et progression mois par mois (retour Thomas). Même
// pattern que finances/page.tsx : pagination explicite (`fetchAllPages`),
// jamais plafonné silencieusement par PostgREST une fois au-delà de la
// limite par page. `profiles.created_at` (pas `auth.users`) : un seul appel
// simple, pas besoin de l'API admin Auth pour ce simple comptage.
export default async function AdminUsersPage() {
  const admin = serviceRoleClient();
  const profiles = await fetchAllPages<ProfileRow>((from, to) =>
    admin
      .from("profiles")
      .select("created_at")
      .order("created_at", { ascending: true })
      .range(from, to)
      .returns<ProfileRow[]>(),
  );

  const newByMonth = new Map<string, number>();
  for (const p of profiles) {
    const month = p.created_at.slice(0, 7); // "AAAA-MM"
    newByMonth.set(month, (newByMonth.get(month) ?? 0) + 1);
  }

  // Ordre chronologique croissant pour calculer le cumul/la progression,
  // puis inversé pour l'affichage (le mois le plus récent en premier).
  // `reduce` (pas un `let` externe réassigné dans `.map()`) : la règle de
  // lint `react-hooks/immutability` signale à tort toute réaffectation
  // d'une variable capturée depuis l'intérieur d'une fonction de composant,
  // même ici dans un Server Component sans aucun état React réel.
  const monthsAsc = [...newByMonth.keys()].sort();
  const rows = monthsAsc.reduce<{ month: string; newUsers: number; cumulative: number; growthPct: number | null }[]>(
    (acc, month) => {
      const newUsers = newByMonth.get(month)!;
      const cumulativeBefore = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
      const growthPct = cumulativeBefore > 0 ? (newUsers / cumulativeBefore) * 100 : null;
      acc.push({ month, newUsers, cumulative: cumulativeBefore + newUsers, growthPct });
      return acc;
    },
    [],
  );
  const rowsDesc = [...rows].reverse();

  return (
    <Card className="flex flex-col gap-3">
      <h1 className="font-display text-lg font-bold text-foreground">Utilisateurs</h1>
      <p className="text-sm text-foreground/70">{profiles.length} compte(s) au total.</p>
      {rowsDesc.length === 0 ? (
        <p className="text-sm text-foreground/60">Aucun compte pour l&apos;instant.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rowsDesc.map((row) => (
            <li
              key={row.month}
              className="flex flex-wrap items-center justify-between gap-2 rounded-konfeti border border-border p-3"
            >
              <span className="text-sm font-semibold text-foreground">{row.month}</span>
              <span className="text-sm text-foreground/70">+{row.newUsers} nouveau(x)</span>
              <span className="text-sm text-foreground/70">{row.cumulative} au total</span>
              <span
                className={`text-sm font-semibold ${
                  row.growthPct === null
                    ? "text-foreground/50"
                    : row.growthPct >= 0
                      ? "text-accent-mint"
                      : "text-accent-coral"
                }`}
              >
                {row.growthPct === null ? "Premier mois" : `${row.growthPct >= 0 ? "+" : ""}${row.growthPct.toFixed(0)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
