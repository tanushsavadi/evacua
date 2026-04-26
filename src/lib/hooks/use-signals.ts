"use client";

import { useEffect, useRef, useState } from "react";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { CrisisState } from "@/components/command-center/state-badge";
import type { LatLng } from "@/lib/geo/types";

export type SignalsResponse = {
  mode: "live";
  sourcesUsed: string[];
  state: CrisisState;
  events: CrisisEvent[];
  computedAt: string;
};

export type UseSignalsOptions = {
  home: LatLng | null;
  /** Live polling interval in ms. Default 90s. */
  livePollMs?: number;
};

export function useSignals({
  home,
  livePollMs = 90_000,
}: UseSignalsOptions) {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevStateRef = useRef<CrisisState | undefined>(undefined);

  useEffect(() => {
    if (!home) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      setIsFetching(true);
      setError(null);
      try {
        const res = await fetch("/api/signals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lat: home.lat,
            lng: home.lng,
            previousState: prevStateRef.current,
          }),
        });
        if (!res.ok) throw new Error(`signals ${res.status}`);
        const json = (await res.json()) as SignalsResponse;
        if (cancelled) return;
        prevStateRef.current = json.state;
        setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch error");
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    };

    fetchOnce();
    timer = setInterval(() => void fetchOnce(), livePollMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [home, livePollMs]);

  return { data, isFetching, error };
}
