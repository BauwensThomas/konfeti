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
        {forecasts.map(({ period, code, temp }) => {
          const { icon, labelKey } = describeWeatherCode(code);
          const Icon = ICONS[icon];
          return (
            <div key={period} className="flex flex-1 flex-col items-center gap-1 text-center text-foreground">
              <span className="flex min-h-8 items-center text-xs font-semibold leading-tight text-foreground/60">
                {t(`weatherPeriod.${period}`)}
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
