// ── Weather Location (localStorage-backed city geocoding via Open-Meteo) ──────

const STORAGE_KEY = "chrono_weather_location";

export interface WeatherLocation {
  city: string;
  country: string;       // country code, e.g. "US"
  latitude: number;
  longitude: number;
}

/** Read stored weather location (null if not set) */
export function getWeatherLocation(): WeatherLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Persist a weather location */
export function setWeatherLocation(loc: WeatherLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
}

/** Clear stored location */
export function clearWeatherLocation(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Search cities via Open-Meteo geocoding (free, no API key) */
export async function searchCities(query: string): Promise<WeatherLocation[]> {
  if (!query || query.trim().length < 2) return [];
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", query.trim());
  url.searchParams.set("count", "6");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("City search failed");
  const data = await res.json();
  if (!data.results) return [];
  return data.results.map((r: any) => ({
    city: [r.name, r.admin1].filter(Boolean).join(", "),
    country: r.country_code || r.country || "",
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}
