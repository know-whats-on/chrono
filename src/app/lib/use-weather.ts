import { useState, useEffect } from "react";
import {
  Sun, CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, Moon,
} from "lucide-react";

// WMO weather code -> icon + label
const WMO_MAP: Record<number, { label: string; Icon: any }> = {
  0: { label: "Clear", Icon: Sun },
  1: { label: "Mostly clear", Icon: Sun },
  2: { label: "Partly cloudy", Icon: CloudSun },
  3: { label: "Overcast", Icon: Cloud },
  45: { label: "Foggy", Icon: Cloud },
  48: { label: "Rime fog", Icon: Cloud },
  51: { label: "Light drizzle", Icon: CloudDrizzle },
  53: { label: "Drizzle", Icon: CloudDrizzle },
  55: { label: "Heavy drizzle", Icon: CloudDrizzle },
  56: { label: "Freezing drizzle", Icon: CloudDrizzle },
  57: { label: "Freezing drizzle", Icon: CloudDrizzle },
  61: { label: "Light rain", Icon: CloudRain },
  63: { label: "Rain", Icon: CloudRain },
  65: { label: "Heavy rain", Icon: CloudRain },
  66: { label: "Freezing rain", Icon: CloudRain },
  67: { label: "Freezing rain", Icon: CloudRain },
  71: { label: "Light snow", Icon: CloudSnow },
  73: { label: "Snow", Icon: CloudSnow },
  75: { label: "Heavy snow", Icon: CloudSnow },
  77: { label: "Snow grains", Icon: CloudSnow },
  80: { label: "Showers", Icon: CloudRain },
  81: { label: "Showers", Icon: CloudRain },
  82: { label: "Heavy showers", Icon: CloudRain },
  85: { label: "Snow showers", Icon: CloudSnow },
  86: { label: "Snow showers", Icon: CloudSnow },
  95: { label: "Thunderstorm", Icon: CloudLightning },
  96: { label: "Thunderstorm + hail", Icon: CloudLightning },
  99: { label: "Thunderstorm + hail", Icon: CloudLightning },
};

export function getWeatherInfo(code: number) {
  return WMO_MAP[code] || { label: "Unknown", Icon: Cloud };
}

// ── Hourly weather entry ──
export interface HourlyEntry {
  hour: number; // 0-23
  temp: number;
  code: number;
}

// ── Daily weather entry ──
export interface DailyEntry {
  date: string; // "YYYY-MM-DD"
  high: number;
  low: number;
  code: number;
}

export interface CalendarWeatherData {
  /** keyed by "YYYY-MM-DD" → DailyEntry */
  daily: Record<string, DailyEntry>;
  /** keyed by "YYYY-MM-DD" → HourlyEntry[] (24 items) */
  hourly: Record<string, HourlyEntry[]>;
  location: string;
}

/** Geocode a timezone to lat/lng using Open-Meteo's geocoding API */
async function geocodeTimezone(timezone?: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const cityPart = tz.split("/").pop()?.replace(/_/g, " ") || "";
  if (!cityPart) return null;

  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityPart)}&count=1&language=en`
  );
  const geoData = await geoRes.json();
  const place = geoData?.results?.[0];
  if (!place) return null;
  return { lat: place.latitude, lng: place.longitude, name: place.name || cityPart };
}

/**
 * Hook to fetch weather data for a range of days (up to 16-day forecast).
 * Returns daily summaries + hourly breakdowns keyed by date.
 */
export function useCalendarWeather(timezone?: string, forecastDays: number = 8) {
  const [data, setData] = useState<CalendarWeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const geo = await geocodeTimezone(timezone);
        if (!geo || cancelled) return;

        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lng}` +
          `&hourly=temperature_2m,weather_code` +
          `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
          `&timezone=auto&forecast_days=${Math.min(forecastDays, 16)}`
        );
        const json = await res.json();
        if (cancelled) return;

        // Build daily map
        const daily: Record<string, DailyEntry> = {};
        const dates: string[] = json.daily?.time || [];
        for (let i = 0; i < dates.length; i++) {
          daily[dates[i]] = {
            date: dates[i],
            high: Math.round(json.daily.temperature_2m_max[i]),
            low: Math.round(json.daily.temperature_2m_min[i]),
            code: json.daily.weather_code[i],
          };
        }

        // Build hourly map keyed by date
        const hourly: Record<string, HourlyEntry[]> = {};
        const hourTimes: string[] = json.hourly?.time || [];
        for (let i = 0; i < hourTimes.length; i++) {
          const dt = hourTimes[i]; // "YYYY-MM-DDTHH:00"
          const dateKey = dt.slice(0, 10);
          const hour = parseInt(dt.slice(11, 13), 10);
          if (!hourly[dateKey]) hourly[dateKey] = [];
          hourly[dateKey].push({
            hour,
            temp: Math.round(json.hourly.temperature_2m[i]),
            code: json.hourly.weather_code[i],
          });
        }

        setData({ daily, hourly, location: geo.name });
      } catch (e) {
        console.error("Calendar weather fetch failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [timezone, forecastDays]);

  return { weather: data, loading };
}
