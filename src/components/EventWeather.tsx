import { getTranslations } from "next-intl/server";
import { describeWeatherCode, fetchPeriodForecasts, type WeatherIconKey } from "@/lib/weather";
import {
  WeatherCloudy,
  WeatherDrizzle,
  WeatherFoggy,
  WeatherPartlyCloudy,
  WeatherRainy,
  WeatherSnowy,
  WeatherStormy,
  WeatherSunny,
} from "@/components/weather/WeatherIcons";

const ICONS: Record<WeatherIconKey, typeof WeatherSunny> = {
  sunny: WeatherSunny,
  partlyCloudy: WeatherPartlyCloudy,
  cloudy: WeatherCloudy,
  foggy: WeatherFoggy,
  drizzle: WeatherDrizzle,
  rainy: WeatherRainy,
  snowy: WeatherSnowy,
  stormy: WeatherStormy,
};

// Météo prévue du jour J (brief 4.6) : composant serveur, appelé uniquement
// quand `shouldShowWeather()` (event-status côté appelant) a déjà validé la
// fenêtre J-5 et la présence de coordonnées -- ne rend RIEN (jamais un état
// d'erreur visible) si Open-Meteo est indisponible ou ne répond pas, cette
// fonctionnalité reste un bonus, jamais un blocage de l'Accueil.
export async function EventWeather({ lat, lng, dateISO }: { lat: number; lng: number; dateISO: string }) {
  const forecasts = await fetchPeriodForecasts(lat, lng, dateISO);
  if (!forecasts) return null;

  const t = await getTranslations("EventPage");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-3 overflow-x-auto">
        {forecasts.map(({ period, hour, code, temp }) => {
          const { icon, labelKey } = describeWeatherCode(code);
          const Icon = ICONS[icon];
          return (
            <div key={period} className="flex flex-1 flex-col items-center gap-1 text-center text-foreground">
              <span className="flex min-h-8 flex-col items-center justify-start leading-tight">
                <span className="text-xs font-semibold text-foreground/60">{hour}h</span>
                {/* Retour Thomas : des heures plutôt que "Matin/Après-midi/Soir"
                    -- mais 9h (jour J) et 9h (lendemain) seraient sinon
                    indiscernables, d'où cette précision en plus petit sur le
                    dernier créneau seulement. */}
                {period === "nextMorning" && (
                  <span className="text-[10px] text-foreground/50">{t("weatherNextDay")}</span>
                )}
              </span>
              <Icon className="h-8 w-8 shrink-0" />
              <span className="sr-only">{t(`weather.${labelKey}`)}</span>
              <span className="text-sm font-semibold">{Math.round(temp)}°</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
