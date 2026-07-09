import type { SupabaseClient } from "@supabase/supabase-js";

// Piège réel découvert en diagnostiquant une pastille non-lus qui ne se
// mettait jamais à jour en direct (retour Thomas) : un canal Realtime
// souscrit dès le montage d'un composant (donc très tôt après le chargement
// de la page) peut envoyer son `phx_join` AVANT que le client navigateur
// (`createBrowserClient`, session lue depuis les cookies de façon
// asynchrone) n'ait fini de synchroniser son JWT vers la couche Realtime.
// Le canal reste alors authentifié "anon" pour toute sa durée de vie : RLS
// bloque silencieusement toute ligne (payload vide + `"errors":["Error 401:
// Unauthorized"]`, visible uniquement dans les frames WebSocket brutes,
// jamais dans le statut `SUBSCRIBED` du client JS). Un composant qui monte
// plus tard (ex. le panneau de chat, ouvert seulement au clic sur l'onglet)
// n'a pas ce problème, la session a eu le temps de s'hydrater entre-temps —
// d'où un bug qui ne touchait que les abonnements "toujours montés".
// Correctif : forcer explicitement la synchro avant de créer un canal.
export async function ensureRealtimeAuth(supabase: SupabaseClient): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  await supabase.realtime.setAuth(session?.access_token ?? null);
}
