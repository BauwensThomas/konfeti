import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { GoHomeActions } from "@/components/GoHomeActions";

type RsvpPublicRow = {
  id: string;
  first_name: string | null;
  arrived_home_at: string | null;
};

// Bloc "Rentrer" + "Je suis bien rentré" (brief 4.11), retour Thomas :
// indépendant du statut Jour J/Terminé de l'événement -- quelqu'un qui n'est
// pas encore rentré chez lui a toujours besoin de ces infos, que l'hôte ait
// cliqué "Terminer" ou pas ("les gens qui rentrent chez eux" ne doivent
// jamais disparaître). Affiché dès le jour J et jusqu'à ce que le Mode Jour J
// s'arrête pour de bon (voir `isJourJ`/`isEventOver`, appelant dans page.tsx).
export async function GoHomeCard({
  eventId,
  shortCode,
  title,
  viewerRsvpId,
  locationText,
  locationLat,
  locationLng,
}: {
  eventId: string;
  shortCode: string;
  title: string;
  viewerRsvpId: string | null;
  locationText: string | null;
  locationLat: number | null;
  locationLng: number | null;
}) {
  const t = await getTranslations("JourJ");
  const supabase = await createClient();

  // Checklist "bien rentré" : visible de TOUT LE MONDE (retour Thomas), via
  // `rsvps_public_data` -- déjà la source utilisée pour l'onglet Personnes
  // non-admin, jamais le nom complet/téléphone.
  const { data: participantRows } = await supabase
    .from("rsvps_public_data")
    .select("id, first_name, arrived_home_at")
    .eq("event_id", eventId)
    .eq("status", "approved")
    .order("first_name")
    .returns<RsvpPublicRow[]>();
  const participants = participantRows ?? [];
  const viewerRow = participants.find((p) => p.id === viewerRsvpId);
  const initialArrivedHome = !!viewerRow?.arrived_home_at;

  // "Rentrer" (brief 4.11), retours Thomas après test réel sur son téléphone :
  // - Uber : `pickup[formatted_address]` en plus de latitude/longitude
  //   (documentation officielle -- "provide as many query parameters as
  //   possible"), sans quoi l'app peut ouvrir sans l'adresse de pickup.
  // - Bolt : aucun lien profond documenté (pas d'API partenaire), mais
  //   `bolt.eu/` géolocalise par IP et affichait le néerlandais pour la
  //   Belgique -- `/fr-be/` force le français (vérifié).
  // - Maps/Waze : contrairement au bloc adresse "venir" de la carte Jour J,
  //   réutiliser un lien vers l'adresse de la fête n'a aucun sens pour
  //   RENTRER (l'invité y est déjà) -- lien "itinéraire" vierge, sans
  //   origine ni destination, pour que l'app se lance prête à taper "maison"
  //   (la destination réelle n'est pas connue de Konfeti).
  const uberUrl =
    locationLat !== null && locationLng !== null
      ? `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${locationLat}&pickup[longitude]=${locationLng}&pickup[nickname]=${encodeURIComponent(title)}&pickup[formatted_address]=${encodeURIComponent(locationText ?? title)}`
      : null;
  const boltUrl = "https://bolt.eu/fr-be/";
  const mapsHomeUrl = "https://www.google.com/maps/dir/?api=1&travelmode=driving";
  const wazeHomeUrl = "https://waze.com/ul";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-konfeti border border-border p-3 text-center">
        <p className="text-sm font-semibold text-foreground/60">{t("goHomeHeading")}</p>
        <div className="flex flex-wrap justify-center gap-3 text-sm font-semibold text-primary">
          {uberUrl && (
            <a href={uberUrl} target="_blank" rel="noopener noreferrer">
              Uber
            </a>
          )}
          <a href={boltUrl} target="_blank" rel="noopener noreferrer">
            Bolt
          </a>
          <a href={mapsHomeUrl} target="_blank" rel="noopener noreferrer">
            {t("mapsLink")}
          </a>
          <a href={wazeHomeUrl} target="_blank" rel="noopener noreferrer">
            {t("wazeLink")}
          </a>
        </div>
      </div>

      {viewerRsvpId && (
        <GoHomeActions rsvpId={viewerRsvpId} shortCode={shortCode} initialArrivedHome={initialArrivedHome} />
      )}

      {/* Checklist "bien rentré", visible de tous (retour Thomas). Bug réel
          corrigé : lister TOUT LE MONDE avec une coche optionnelle donnait
          l'impression trompeuse que tous étaient "bien rentrés" -- un titre
          au passé composé ne doit contenir que ceux qui ont réellement
          cliqué. */}
      {participants.some((p) => p.arrived_home_at) && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground/60">{t("arrivedHomeChecklistHeading")}</p>
          <ul className="flex flex-col gap-0.5 text-sm text-foreground">
            {participants
              .filter((p) => p.arrived_home_at)
              .map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span>{p.first_name ?? t("anonymous")}</span>
                  <span className="text-accent-mint">{t("arrivedHomeCheck")}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
