"use server";

import { createClient } from "@/lib/supabase/server";
import { isRateLimited } from "@/lib/rate-limit";
import { buildTheForkAffiliateUrl } from "@/lib/awin";

export type NearbyRestaurant = {
  placeId: string;
  name: string;
  address: string;
  theForkUrl: string;
};

type SearchResult = { ok: true; restaurants: NearbyRestaurant[] } | { ok: false; error: "not_authenticated" | "rate_limited" | "unavailable" };

// Sondage resto (brief 4.6, V1.1) : recherche de vrais restaurants proches
// via Google Places (clé serveur uniquement, `GOOGLE_MAPS_API_KEY` -- jamais
// exposée au client, même prudence que Stripe/VAPID). Le lien TheFork affilié
// (Awin) est construit ici, côté serveur, pour ne jamais exposer
// `AWIN_MERCHANT_ID`/`AWIN_AFFILIATE_ID` au client. Jamais bloquant : sur
// tout échec (clé absente, erreur réseau, quota Google), retourne une erreur
// typée plutôt que de faire planter le wizard -- même philosophie que
// `fetchPeriodForecasts` (`src/lib/weather.ts`).
export async function searchNearbyRestaurants(lat: number, lng: number): Promise<SearchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "not_authenticated" };
  }

  if (isRateLimited(`searchNearbyRestaurants:${user.id}`, 30, 60 * 60 * 1000)) {
    return { ok: false, error: "rate_limited" };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "unavailable" };
  }

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
      },
      body: JSON.stringify({
        includedTypes: ["restaurant"],
        maxResultCount: 15,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 1500 } },
      }),
    });

    if (!response.ok) {
      return { ok: false, error: "unavailable" };
    }

    const data = await response.json();
    const places = (data.places ?? []) as {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
    }[];

    const restaurants: NearbyRestaurant[] = places.map((p) => {
      const name = p.displayName?.text ?? "";
      return {
        placeId: p.id,
        name,
        address: p.formattedAddress ?? "",
        theForkUrl: buildTheForkAffiliateUrl(name, null),
      };
    });

    return { ok: true, restaurants };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
