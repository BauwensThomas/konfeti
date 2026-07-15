import { getTranslations } from "next-intl/server";
import { isAfterMidnightContext } from "@/lib/arrival-info";

// "Infos pratiques pour venir" (brief 4.6), partagé entre la carte pré-Jour-J
// (page.tsx) et `JourJCard.tsx` pour ne jamais dupliquer cette logique deux
// fois. Maps/Waze existants inchangés + un lien "transports en commun"
// générique (fonctionne pour n'importe quelle ville, contrairement aux noms
// de réseaux cités en exemple par le brief, Noctis/Noctilien -- coder ces
// deux villes en dur n'aurait aucun sens pour une app qui ne s'y limite pas)
// + Uber/Bolt pour VENIR (`dropoff[...]`, symétrique du `pickup[...]` déjà
// utilisé pour rentrer dans `GoHomeCard.tsx`), affichés seulement "après
// minuit" (brief : "deep links Uber/Bolt pré-remplis après minuit").
export async function ArrivalInfoBlock({
  locationText,
  locationLat,
  locationLng,
  title,
}: {
  locationText: string | null;
  locationLat: number | null;
  locationLng: number | null;
  title: string;
}) {
  const t = await getTranslations("JourJ");

  if (!locationText) return null;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}`;
  const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(locationText)}&navigate=yes`;
  const transitUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locationText)}&travelmode=transit`;

  const showNightLinks = isAfterMidnightContext();
  const uberUrl =
    showNightLinks && locationLat !== null && locationLng !== null
      ? `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${locationLat}&dropoff[longitude]=${locationLng}&dropoff[nickname]=${encodeURIComponent(title)}&dropoff[formatted_address]=${encodeURIComponent(locationText)}`
      : null;
  const boltUrl = showNightLinks ? "https://bolt.eu/fr-be/" : null;

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-2xl font-bold text-foreground">{locationText}</p>
      <div className="flex flex-wrap justify-center gap-4 text-sm font-semibold text-primary">
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
          {t("mapsLink")}
        </a>
        <a href={wazeUrl} target="_blank" rel="noopener noreferrer">
          {t("wazeLink")}
        </a>
        <a href={transitUrl} target="_blank" rel="noopener noreferrer">
          {t("transitLink")}
        </a>
        {uberUrl && (
          <a href={uberUrl} target="_blank" rel="noopener noreferrer">
            Uber
          </a>
        )}
        {boltUrl && (
          <a href={boltUrl} target="_blank" rel="noopener noreferrer">
            Bolt
          </a>
        )}
      </div>
    </div>
  );
}
