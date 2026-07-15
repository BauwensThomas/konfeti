"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { searchNearbyRestaurants, type NearbyRestaurant } from "@/app/[locale]/actions/places";
import type { PollOptionRow } from "@/components/CreateEventWizard";

// Sondage resto (brief 4.6, V1.1) : recherche de vrais restaurants proches
// (Google Places) au lieu de taper des options à la main -- affiché quand
// `poll.kind === "restaurant"` dans le wizard. Coche/décoche alimente
// directement le tableau `options` consommé par `syncPolls`, sans changement
// de sa part (même forme `{id, label, externalUrl}` qu'un sondage classique).
export function RestaurantPollPicker({
  locationLat,
  locationLng,
  selectedOptions,
  onOptionsChange,
}: {
  locationLat: number | null;
  locationLng: number | null;
  selectedOptions: PollOptionRow[];
  onOptionsChange: (options: PollOptionRow[]) => void;
}) {
  const t = useTranslations("CreateEvent");
  const [results, setResults] = useState<NearbyRestaurant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedNames = new Set(selectedOptions.map((o) => o.label));

  async function handleSearch() {
    if (locationLat === null || locationLng === null) return;
    setLoading(true);
    setError(null);
    const result = await searchNearbyRestaurants(locationLat, locationLng);
    setLoading(false);
    if (!result.ok) {
      setError(t("step4.restaurantSearchError"));
      return;
    }
    setResults(result.restaurants);
    if (result.restaurants.length === 0) {
      setError(t("step4.restaurantSearchEmpty"));
    }
  }

  function toggleRestaurant(restaurant: NearbyRestaurant) {
    if (selectedNames.has(restaurant.name)) {
      onOptionsChange(selectedOptions.filter((o) => o.label !== restaurant.name));
    } else {
      onOptionsChange([
        ...selectedOptions,
        { id: null, label: restaurant.name, externalUrl: restaurant.theForkUrl },
      ]);
    }
  }

  if (locationLat === null || locationLng === null) {
    return <p className="text-sm text-foreground/60">{t("step4.restaurantSearchNeedsLocation")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleSearch}
        disabled={loading}
        className="self-start text-sm font-semibold text-primary disabled:opacity-50"
      >
        {loading ? t("step4.restaurantSearching") : t("step4.restaurantSearchButton")}
      </button>
      {error && <p className="text-sm text-accent-coral">{error}</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((restaurant) => (
            <li key={restaurant.placeId} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={selectedNames.has(restaurant.name)}
                onChange={() => toggleRestaurant(restaurant)}
                id={`restaurant-${restaurant.placeId}`}
              />
              <label htmlFor={`restaurant-${restaurant.placeId}`} className="flex-1">
                <span className="font-semibold">{restaurant.name}</span>
                {restaurant.address && <span className="text-foreground/60"> — {restaurant.address}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {/* Liste explicite des restaurants déjà retenus (pas juste un chiffre,
          retour Thomas : "pourquoi j'ai ça qui reste ?" -- un compteur seul
          ne dit pas LESQUELS sont choisis, ni comment les retirer une fois
          que la recherche a été relancée ou que les résultats ont changé). */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-col gap-1 rounded-konfeti bg-surface p-2">
          <p className="text-xs font-semibold text-foreground/60">
            {t("step4.restaurantSelectedCount", { count: selectedOptions.length })}
          </p>
          <ul className="flex flex-col gap-1">
            {selectedOptions.map((option, index) => (
              <li key={option.id ?? option.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-foreground">{option.label}</span>
                <button
                  type="button"
                  onClick={() => onOptionsChange(selectedOptions.filter((_, i) => i !== index))}
                  className="shrink-0 text-xs font-semibold text-accent-coral"
                >
                  {t("step4.restaurantRemoveSelected")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Retour Thomas : avec un seul restaurant, "Suivant" reste désactivé
          (voir `canAdvance` dans CreateEventWizard.tsx) -- message explicite
          pour ne jamais laisser deviner pourquoi. */}
      {selectedOptions.length === 1 && (
        <p className="text-xs font-semibold text-accent-coral">{t("step4.restaurantNeedsOneMore")}</p>
      )}
    </div>
  );
}
