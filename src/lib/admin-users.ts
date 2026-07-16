import type { SupabaseClient } from "@supabase/supabase-js";

// `auth.admin.listUsers()` ne renvoie qu'UNE PAGE (défaut 50, plafond
// pratique autour de 1000 selon la version de GoTrue) -- jamais fiable de
// supposer qu'un seul appel couvre tous les comptes (retour Thomas : déjà
// 953 comptes en base à ce stade, majoritairement du bruit e2e, mais le
// risque de manquer des résultats de recherche est réel et va empirer avec
// la croissance réelle du site). Pagine jusqu'à une page vide.
export async function listAllAuthUsers(
  admin: SupabaseClient,
): Promise<{ id: string; email: string | null }[]> {
  const users: { id: string; email: string | null }[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users || data.users.length === 0) break;
    for (const u of data.users) {
      users.push({ id: u.id, email: u.email ?? null });
    }
    if (data.users.length < perPage) break;
    page += 1;
  }

  return users;
}
