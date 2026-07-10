// Météo prévue du jour J (brief 4.6/6) : Open-Meteo (gratuit, sans clé). Le
// géocodage se fait désormais côté client au moment où l'organisateur choisit
// une suggestion Photon (voir LocationAutocomplete.tsx) -- ce module ne fait
// plus AUCUN géocodage lui-même, seulement la prévision à partir de lat/lng
// déjà connus.

export type WeatherIconKey =
  | "sunny"
  | "partlyCloudy"
  | "cloudy"
  | "foggy"
  | "drizzle"
  | "rainy"
  | "snowy"
  | "stormy";

export type WeatherPeriod = "morning" | "afternoon" | "evening" | "nextMorning";

export type PeriodForecast = {
  period: WeatherPeriod;
  code: number;
  temp: number;
};

// Retour Thomas : "j'aimerais que la météo on met matin, après-midi, soir et
// le matin du lendemain" -- plutôt qu'un simple min/max de la journée, une
// prévision HORAIRE à 4 heures représentatives (matin/après-midi/soir du
// jour J, puis matin du lendemain -- utile pour savoir si la fête peut se
// prolonger dehors). `dayOffset: 1` vise le jour suivant `dateISO`.
const PERIOD_HOURS: { period: WeatherPeriod; dayOffset: 0 | 1; hour: number }[] = [
  { period: "morning", dayOffset: 0, hour: 9 },
  { period: "afternoon", dayOffset: 0, hour: 15 },
  { period: "evening", dayOffset: 0, hour: 20 },
  { period: "nextMorning", dayOffset: 1, hour: 9 },
];

function addDays(dateISO: string, days: number): string {
  const date = new Date(`${dateISO}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Jamais bloquant : une fonctionnalité bonus ne doit jamais faire planter le
// rendu de l'Accueil si Open-Meteo est indisponible ou répond mal -- `null`
// dans tous les cas d'échec (réseau, réponse inattendue, heure absente de la
// prévision), jamais d'exception qui remonte à l'appelant.
export async function fetchPeriodForecasts(
  lat: number,
  lng: number,
  dateISO: string,
): Promise<PeriodForecast[] | null> {
  try {
    const endDate = addDays(dateISO, 1);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=weathercode,temperature_2m&timezone=auto&start_date=${dateISO}&end_date=${endDate}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) return null;

    const data = await response.json();
    const times: unknown[] = data?.hourly?.time ?? [];
    const codes: unknown[] = data?.hourly?.weathercode ?? [];
    const temps: unknown[] = data?.hourly?.temperature_2m ?? [];

    const results: PeriodForecast[] = [];
    for (const { period, dayOffset, hour } of PERIOD_HOURS) {
      const targetTime = `${addDays(dateISO, dayOffset)}T${String(hour).padStart(2, "0")}:00`;
      const index = times.indexOf(targetTime);
      const code = codes[index];
      const temp = temps[index];
      if (index === -1 || typeof code !== "number" || typeof temp !== "number") continue;
      results.push({ period, code, temp });
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

export type WeatherLabelKey =
  | "sunny"
  | "partlyCloudy"
  | "cloudy"
  | "overcast"
  | "foggy"
  | "drizzle"
  | "rainy"
  | "snowy"
  | "showers"
  | "snowShowers"
  | "stormy";

// Codes WMO renvoyés par Open-Meteo (`weathercode`) regroupés par tranche --
// voir https://open-meteo.com/en/docs pour la table complète. `labelKey` est
// une clé de traduction (résolue par l'appelant via next-intl), pas un texte
// affichable directement -- ce module reste indépendant de next-intl, même
// principe que `BringGauge`/`UnitPickerButton`.
export function describeWeatherCode(code: number): { icon: WeatherIconKey; labelKey: WeatherLabelKey } {
  if (code === 0) return { icon: "sunny", labelKey: "sunny" };
  if (code === 1) return { icon: "partlyCloudy", labelKey: "partlyCloudy" };
  if (code === 2) return { icon: "cloudy", labelKey: "cloudy" };
  if (code === 3) return { icon: "cloudy", labelKey: "overcast" };
  if (code === 45 || code === 48) return { icon: "foggy", labelKey: "foggy" };
  if (code >= 51 && code <= 57) return { icon: "drizzle", labelKey: "drizzle" };
  if (code >= 61 && code <= 67) return { icon: "rainy", labelKey: "rainy" };
  if (code >= 71 && code <= 77) return { icon: "snowy", labelKey: "snowy" };
  if (code >= 80 && code <= 82) return { icon: "rainy", labelKey: "showers" };
  if (code >= 85 && code <= 86) return { icon: "snowy", labelKey: "snowShowers" };
  if (code >= 95 && code <= 99) return { icon: "stormy", labelKey: "stormy" };
  return { icon: "cloudy", labelKey: "cloudy" };
}

// Fenêtre d'affichage (brief : "affichée automatiquement à partir de J-5") :
// du 5e jour avant l'événement jusqu'au jour même inclus. Comparaison de
// dates CIVILES (comme `isEventFinished` dans event-status.ts), pas
// d'horodatage précis -- l'heure exacte de la fête n'a aucune importance ici.
export function shouldShowWeather(
  startsAt: string | null,
  dateMode: string,
  hasCoords: boolean,
  now: Date = new Date(),
): boolean {
  if (dateMode !== "fixed" || !startsAt || !hasCoords) return false;

  const eventDay = new Date(startsAt);
  eventDay.setHours(0, 0, 0, 0);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const DAY_MS = 24 * 60 * 60 * 1000;
  const daysUntilEvent = Math.round((eventDay.getTime() - today.getTime()) / DAY_MS);

  return daysUntilEvent >= 0 && daysUntilEvent <= 5;
}
