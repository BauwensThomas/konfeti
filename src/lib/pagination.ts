// PostgREST (Supabase) plafonne les lignes renvoyées par requête (souvent
// 1000 par défaut) -- toute liste/agrégation qui pourrait dépasser ce
// nombre un jour doit paginer explicitement plutôt que supposer qu'un seul
// appel ramène tout (retour Thomas, back-office /admin : silencieux,
// jamais une erreur visible, juste des lignes manquantes). Pagine par blocs
// de `pageSize` via `.range()` jusqu'à une page vide ou incomplète.
export async function fetchAllPages<T>(
  // `PromiseLike`, pas `Promise` : le query builder supabase-js est
  // "thenable" (implémente `.then()`) mais pas une vraie instance de
  // Promise -- une signature `Promise<...>` ici rejette sinon l'appel direct
  // d'un `.select()...range()` non "await"-é en argument.
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}
