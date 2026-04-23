"use client";

import { useEffect, useRef, useState } from "react";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { CrisisState } from "@/components/command-center/state-badge";
import type { LatLng } from "@/lib/schemas/household";

export type SignalsResponse = {
  mode: "live" | "scenario";
  sourcesUsed: string[];
  state: CrisisState;
  events: CrisisEvent[];
  computedAt: string;
};

export type UseSignalsOptions = {
  home: LatLng | null;
  demo?: string | null;
  /** Scripted scenario advance step in seconds per poll. */
  scenarioStepSec?: number;
  /** Live polling interval in ms. Default 90s. */
  livePollMs?: number;
  /** Scenario frame advance cadence in ms. Default 4s. */
  scenarioTickMs?: number;
};

export function useSignals({
  home,
  demo,
  scenarioStepSec = 45,
  livePollMs = 90_000,
  scenarioTickMs = 4_000,
}: UseSignalsOptions) {
  const [data, setData] = useState<SignalsResponse | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tRef = useRef<number>(0);
  const prevStateRef = useRef<CrisisState | undefined>(undefined);

  useEffect(() => {
    tRef.current = 0;
    prevStateRef.current = undefined;
  }, [demo]);

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
            demo: demo ?? undefined,
            tSec: demo ? tRef.current : undefined,
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

    if (demo) {
      timer = setInterval(() => {
        tRef.current += scenarioStepSec;
        void fetchOnce();
      }, scenarioTickMs);
    } else {
      timer = setInterval(() => void fetchOnce(), livePollMs);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [home, demo, scenarioStepSec, scenarioTickMs, livePollMs]);

  return { data, isFetching, error };
}
