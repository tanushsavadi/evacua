"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo/types";

export type FireStateResponse = {
  fires: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    polygon_coords: [number, number][];
    estimated_radius: number;
    growth_rate: number;
    risk_level: string;
    containment: number;
    last_update: string;
    description: string;
  }>;
  firestations: Array<{
    id: number;
    name: string;
    city: string;
    county: string;
    lat: number;
    lon: number;
    active_route: unknown;
  }>;
  count: {
    active_fires: number;
    firestations: number;
  };
  timestamp: string;
};

export type ResponderStatsResponse = {
  stats: Array<{
    firestation_id: number;
    firestation_name: string;
    available_teams: number;
    dispatched_teams: number;
    active_teams: number;
    total_teams: number;
  }>;
  activeResponders: Array<{
    id: string;
    stationId: number;
    teamNumber: number;
    status: "available" | "dispatched" | "en_route" | "on_scene";
    incidentId: string | null;
    dispatchedAt: string | null;
    etaIso: string | null;
  }>;
  totals: {
    available: number;
    dispatched: number;
    active: number;
    total: number;
  };
};

export type RouteOpsResponse = {
  routes: Array<{
    id: string;
    station_id: number;
    station_name?: string;
    fire_id?: string;
    fire_name?: string;
    original_route: unknown;
    new_route: unknown;
    reason: string;
    risk_score: number | null;
    created_at: string;
  }>;
  evacuations: Array<{
    id: string;
    fire_id: string;
    zone_name: string | null;
    polygon: unknown;
    recommended_at: string;
  }>;
  timestamp: string;
};

export type AgentOpsResponse = {
  status: "complete";
  scannedAt: string;
  firesAnalyzed: number;
  stationsAnalyzed: number;
  findings: Array<{
    id: string;
    type: "route_risk" | "evacuation_zone";
    severity: "watch" | "high" | "critical";
    fireId: string;
    fireName: string;
    stationId?: number;
    stationName?: string;
    riskScore?: number;
    distanceKm?: number;
    reason: string;
  }>;
  createdRouteUpdates: RouteOpsResponse["routes"];
  createdEvacuations: RouteOpsResponse["evacuations"];
};

export function useFireOps({
  home,
  pollMs = 20_000,
}: {
  home: LatLng | null;
  pollMs?: number;
}) {
  const [fireState, setFireState] = useState<FireStateResponse | null>(null);
  const [responderOps, setResponderOps] = useState<ResponderStatsResponse | null>(null);
  const [routeOps, setRouteOps] = useState<RouteOpsResponse | null>(null);
  const [agentOps, setAgentOps] = useState<AgentOpsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const agentLastRunRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!home) return;
    setLoading(true);
    try {
      const shouldRunAgent = Date.now() - agentLastRunRef.current > 60_000;
      const [fireRes, responderRes, agentRes] = await Promise.all([
        fetch("/api/fire-state", { cache: "no-store" }),
        fetch("/api/dispatch-responder", { cache: "no-store" }),
        shouldRunAgent ? fetch("/api/fire-agent", { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const routeRes = await fetch("/api/update-routes", { cache: "no-store" });
      
      if (fireRes.ok) {
        setFireState((await fireRes.json()) as FireStateResponse);
      }
      if (responderRes.ok) {
        const json = (await responderRes.json()) as ResponderStatsResponse;
        setResponderOps(json);
      }
      if (routeRes.ok) {
        setRouteOps((await routeRes.json()) as RouteOpsResponse);
      }
      if (agentRes?.ok) {
        setAgentOps((await agentRes.json()) as AgentOpsResponse);
        agentLastRunRef.current = Date.now();
      }
    } catch (error) {
      console.error("[useFireOps] Refresh error:", error);
    } finally {
      setLoading(false);
    }
  }, [home]);

  useEffect(() => {
    if (!home) return;

    const canPoll = () => typeof document === "undefined" || document.visibilityState === "visible";
    
    const poll = async () => {
      if (!canPoll()) return;
      await refresh();
    };

    const handleVisibilityChange = () => {
      if (canPoll()) void poll();
    };
    
    void poll();
    const id = globalThis.setInterval(() => void poll(), pollMs);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      globalThis.clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [home, pollMs, refresh]);

  return {
    fireState,
    responderOps,
    responderStats: responderOps?.totals ?? null,
    routeOps,
    agentOps,
    loading,
    refresh,
  };
}
