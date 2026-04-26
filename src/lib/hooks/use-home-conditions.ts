"use client";

import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/geo/types";

export type HomeConditions = {
  computedAt: string;
  weather: {
    label: string;
    temperatureF: number | null;
    humidityPct: number | null;
    windMph: number | null;
    windDeg: number | null;
    windDir: string;
  };
  air: {
    aqi: number | null;
    pm25: number | null;
    pm10: number | null;
  };
  risk: {
    fireRiskPct: number;
  };
};

export function useHomeConditions(home: LatLng | null, pollMs = 90_000) {
  const [data, setData] = useState<HomeConditions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!home) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/weather?lat=${home.lat}&lng=${home.lng}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`weather ${res.status}`);
        const json = (await res.json()) as HomeConditions;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "weather error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    timer = setInterval(() => void run(), pollMs);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [home, pollMs]);

  return { data, loading, error };
}
