"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureRealtimeAuth } from "@/lib/supabase/realtime-auth";

// Un participant en attente/restreint doit voir la décision de l'admin
// (validé/refusé) se refléter automatiquement, sans F5 (retour Thomas :
// "si l'admin valide, ma page charge directement dans l'événement").
// Même piège Realtime que partout ailleurs dans le projet (voir
// doc/DECISIONS.md) : jamais de filtre serveur sur une colonne hors clé
// primaire, et `ensureRealtimeAuth` avant de créer le canal (ce composant
// monte dès le chargement de la page, potentiellement avant la synchro du
// JWT vers la couche Realtime).
export function useLiveRsvpRefresh(rsvpId: string) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    ensureRealtimeAuth(supabase).then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`rsvp-${rsvpId}-live`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rsvps" },
          (payload) => {
            if ((payload.new as { id?: string })?.id === rsvpId) router.refresh();
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `router` change d'identité à chaque navigation ; seul `rsvpId` doit re-créer l'abonnement.
  }, [rsvpId]);
}
