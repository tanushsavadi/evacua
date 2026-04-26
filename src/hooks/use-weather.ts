'use client';

import { useEffect, useState, useCallback } from 'react';

export interface WeatherData {
  wind: {
    speed: number;
    deg: number;
    direction: string;
  };
  temp: number;
  humidity: number;
  visibility: number | null;
  airQuality: {
    aqi: number | null;
    pm2_5: number | null;
    pm10: number | null;
  } | null;
  description: string;
  location: string;
}

export function useWeather(lat: number | null, lon: number | null) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async (latitude: number, longitude: number) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/weather?lat=${latitude}&lon=${longitude}`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      // Map the evacua weather API response shape to our WeatherData interface
      setWeather({
        wind: {
          speed: Math.round(data.weather?.windMph ?? 0),
          deg: data.weather?.windDeg ?? 0,
          direction: data.weather?.windDir ?? 'N/A',
        },
        temp: Math.round(data.weather?.temperatureF ?? 0),
        humidity: data.weather?.humidityPct ?? 0,
        visibility: null, // Not provided by Open-Meteo
        airQuality: data.air ? {
          aqi: data.air.aqi,
          pm2_5: data.air.pm25,
          pm10: data.air.pm10,
        } : null,
        description: data.weather?.label ?? 'Unknown',
        location: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setWeather({
        wind: { speed: 0, deg: 0, direction: 'N/A' },
        temp: 0,
        humidity: 0,
        visibility: null,
        airQuality: null,
        description: 'Unavailable',
        location: 'Unknown',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lat !== null && lon !== null) {
      const t = setTimeout(() => fetchWeather(lat, lon), 1000);
      return () => clearTimeout(t);
    }
  }, [lat, lon, fetchWeather]);

  return { weather, loading, error, refetch: fetchWeather };
}
