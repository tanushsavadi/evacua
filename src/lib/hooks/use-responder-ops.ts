"use client";

import { useCallback, useEffect, useState } from "react";
import type { CrisisEvent } from "@/lib/schemas/crisis";

type ResponderTotals = {
  available: number;
  dispatched: number;
  active: number;
  total: number;
};

type DispatchResponse = {
  success: boolean;
  responder?: {
    firestation_name: string;
    team_number: number;
    estimated_duration: number;
  };
  error?: string;
  message?: string;
};

type ResponderStationStat = {
  firestation_id: number;
  firestation_name: string;
  available_teams: number;
  dispatched_teams: number;
  active_teams: number;
  total_teams: number;
};

type ActiveResponder = {
  id: string;
  stationId: number;
  teamNumber: number;
  status: "available" | "dispatched" | "en_route" | "on_scene";
  incidentId: string | null;
  etaIso: string | null;
};

export function useResponderOps(event: CrisisEvent | null) {
  const [totals, setTotals] = useState<ResponderTotals | null>(null);
  const [stationStats, setStationStats] = useState<ResponderStationStat[]>([]);
  const [activeResponders, setActiveResponders] = useState<ActiveResponder[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [lastDispatch, setLastDispatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    setError(null);
    try {
      const res = await fetch("/api/dispatch-responder", { cache: "no-store" });
      if (!res.ok) throw new Error(`stats ${res.status}`);
      const json = (await res.json()) as {
        totals?: ResponderTotals;
        stats?: ResponderStationStat[];
        activeResponders?: ActiveResponder[];
      };
      if (json.totals) setTotals(json.totals);
      setStationStats(json.stats ?? []);
      setActiveResponders(json.activeResponders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load responder stats");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    const initial = globalThis.setTimeout(() => void fetchStats(), 0);
    const id = globalThis.setInterval(() => void fetchStats(), 5000);
    return () => {
      globalThis.clearTimeout(initial);
      globalThis.clearInterval(id);
    };
  }, [fetchStats]);

  const dispatch = useCallback(async () => {
    if (!event) return;
    setDispatching(true);
    setError(null);
    try {
      const res = await fetch("/api/dispatch-responder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          incidentId: event.id,
          incidentLat: event.centroid.lat,
          incidentLon: event.centroid.lng,
        }),
      });
      const json = (await res.json()) as DispatchResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? json.message ?? `dispatch ${res.status}`);
      }
      const summary = json.responder
        ? `Team ${json.responder.team_number} from ${json.responder.firestation_name} dispatched (${Math.round(json.responder.estimated_duration / 60)}m ETA)`
        : "Responder dispatched.";
      setLastDispatch(summary);
      await fetchStats();
      return { ok: true, summary };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Dispatch failed";
      setError(msg);
      return { ok: false, summary: msg };
    } finally {
      setDispatching(false);
    }
  }, [event, fetchStats]);

  return {
    totals,
    stationStats,
    activeResponders,
    loadingStats,
    dispatching,
    lastDispatch,
    error,
    dispatch,
    refresh: fetchStats,
  };
}
