"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl, {
  type MapLayerMouseEvent,
  type Map as MapboxMap,
  type Marker,
} from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { LatLng } from "@/lib/geo/types";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import { representativePoint } from "@/lib/geo/representative-point";
import { getFireVideo, getSignalVideo } from "@/lib/video/signal-preview";
import type {
  AgentOpsResponse,
  RouteOpsResponse,
} from "@/lib/hooks/use-fire-ops";

type FireOpsState = {
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
  timestamp: string;
};

type RouteGeometry = {
  id: string;
  coordinates: [number, number][];
};

type ResponderOpsState = {
  activeResponders: Array<{
    id: string;
    stationId: number;
    teamNumber: number;
    status: "available" | "dispatched" | "en_route" | "on_scene";
    incidentId: string | null;
    dispatchedAt: string | null;
    etaIso: string | null;
  }>;
};

type FireAnimationState = {
  seed: number;
  startTime: number;
  growthVectors: number[];
  windKey: string;
};

const METERS_PER_DEGREE_LAT = 111320;
const EVACUA_DEMO_MAPBOX_TOKEN =
  "";
const DEMO_MAPBOX_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_EVACUA_DEMO_MODE === "true";
const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ??
  (DEMO_MAPBOX_FALLBACK_ENABLED ? EVACUA_DEMO_MAPBOX_TOKEN : "");

type Props = {
  home?: LatLng | null;
  destination?: LatLng | null;
  routes?: RouteGeometry[];
  selectedRouteId?: string;
  events?: CrisisEvent[];
  focusedEventId?: string | null;
  fireState?: FireOpsState | null;
  responderOps?: ResponderOpsState | null;
  routeOps?: RouteOpsResponse | null;
  agentOps?: AgentOpsResponse | null;
  windMph?: number;
  windDeg?: number;
  onFocusEvent?: (eventId: string) => void;
};

export function MapPanel({
  home,
  destination,
  routes,
  selectedRouteId,
  events,
  focusedEventId,
  fireState,
  responderOps,
  routeOps,
  windMph,
  windDeg,
  onFocusEvent,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const homeMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const eventMarkers = useRef<Marker[]>([]);
  const eventMarkersById = useRef<Record<string, Marker>>({});
  const stationMarkers = useRef<Marker[]>([]);
  const responderMarkers = useRef<Marker[]>([]);
  const fireAnimationState = useRef<Record<string, FireAnimationState>>({});
  const incidentPopup = useRef<mapboxgl.Popup | null>(null);
  const latestFireState = useRef<FireOpsState | null>(null);
  const fireStateRef = useRef<Record<string, {
    baseRadius: number;
    roughness: number;
    waveSpeed: number;
    amplitude: number;
    expansionRate: number;
    seed: number;
    growthVectors: number[];
    startTime: number;
  }>>({});
  const onFocusEventRef = useRef<Props["onFocusEvent"]>(onFocusEvent);
  const styleReady = useRef(false);
  const [responderTick, setResponderTick] = useState(() => Date.now());

  useEffect(() => {
    latestFireState.current = fireState ?? null;
  }, [fireState]);

  useEffect(() => {
    onFocusEventRef.current = onFocusEvent;
  }, [onFocusEvent]);

  useEffect(() => {
    const id = globalThis.setInterval(() => setResponderTick(Date.now()), 10_000);
    return () => globalThis.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !container.current || mapRef.current) return;
    const center: [number, number] = home
      ? [home.lng, home.lat]
      : [-119.417932, 36.778259];

    const fireLayerId = "evacua-fire-spread-fill";

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center,
      zoom: home ? 11.5 : 5.6,
      minZoom: 4,
      maxZoom: 18,
      pitch: home ? 42 : 38,
      bearing: home ? -10 : 0,
      attributionControl: false,
      cooperativeGestures: false,
    });

    map.addControl(
      new mapboxgl.NavigationControl({
        showCompass: true,
        visualizePitch: true,
      }),
      "bottom-right",
    );

    map.on("load", () => {
      installDetailedMapbox3dContext(map);

      // Hazard polygons (fire perimeters, evac zones)
      map.addSource("evacua-hazards", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "evacua-hazard-fill",
        type: "fill",
        source: "evacua-hazards",
        paint: {
          "fill-color": [
            "match",
            ["get", "category"],
            "fire", "#FF5B2E",
            "evac_order", "#E25656",
            "evac_warning", "#F5B041",
            "#FF9E3D",
          ],
          "fill-opacity": [
            "match",
            ["get", "category"],
            "fire", 0.22,
            "evac_order", 0.18,
            "evac_warning", 0.12,
            0.15,
          ],
        },
      });
      map.addLayer({
        id: "evacua-hazard-outline",
        type: "line",
        source: "evacua-hazards",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "match",
            ["get", "category"],
            "fire", "#FF6A3A",
            "evac_order", "#E25656",
            "evac_warning", "#F5B041",
            "#FF9E3D",
          ],
          "line-width": [
            "match",
            ["get", "category"],
            "fire", 1.8,
            "evac_order", 1.6,
            "evac_warning", 1.2,
            1.2,
          ],
          "line-opacity": 0.85,
          "line-dasharray": [
            "match",
            ["get", "category"],
            "evac_warning", ["literal", [2, 2]],
            ["literal", [1]],
          ],
        },
      });

      // Road closures (linear)
      map.addSource("evacua-closures", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "evacua-closure-casing",
        type: "line",
        source: "evacua-closures",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#07080a",
          "line-width": 6,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "evacua-closure",
        type: "line",
        source: "evacua-closures",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#E25656",
          "line-width": 3,
          "line-dasharray": [2, 2],
          "line-opacity": 0.95,
        },
      });

      // Autonomous agent evacuation buffers.
      map.addSource("evacua-agent-evacuations", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "evacua-agent-evacuation-fill",
        type: "fill",
        source: "evacua-agent-evacuations",
        paint: {
          "fill-color": "#E25656",
          "fill-opacity": 0.11,
        },
      });
      map.addLayer({
        id: "evacua-agent-evacuation-outline",
        type: "line",
        source: "evacua-agent-evacuations",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#E25656",
          "line-width": 1.4,
          "line-opacity": 0.75,
          "line-dasharray": [2, 2],
        },
      });

      // Wind-influenced fire spread simulation.
      map.addSource("evacua-fire-spread", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "evacua-fire-spread-fill",
        type: "fill",
        source: "evacua-fire-spread",
        paint: {
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "intensity"],
            0, "rgba(140, 20, 0, 0.35)",      // Core (oldest)
            0.2, "rgba(180, 35, 5, 0.45)",    // Deep maroon-red
            0.35, "rgba(200, 50, 10, 0.55)",  // Dark burnt orange
            0.5, "rgba(220, 70, 15, 0.65)",   // Rich orange-red
            0.65, "rgba(235, 90, 25, 0.7)",   // Deeper orange
            0.8, "rgba(245, 110, 35, 0.75)",  // Bright orange
            1, "rgba(255, 130, 50, 0.8)"      // Edge (active)
          ],
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7, 0.5,
            10, 0.65,
            13, 0.75,
            16, 0.85
          ],
          "fill-outline-color": "rgba(200, 60, 0, 0.5)"
        },
      });

      // Add glow outline layer
      map.addLayer({
        id: "fire-glow-outline",
        type: "line",
        source: "evacua-fire-spread",
        paint: {
          "line-color": "rgba(240, 100, 40, 0.75)",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7, 1.5,
            12, 3,
            15, 5
          ],
          "line-blur": 4,
          "line-opacity": 0.8
        }
      }, "evacua-fire-spread-fill");

      const openFireFromLayer = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (!id) return;
        const fire = latestFireState.current?.fires.find((item) => item.id === String(id));
        if (!fire) return;
        onFocusEventRef.current?.(fire.id);
        focusFireIn3d(map, fire);
        showFireIncidentPopup(map, incidentPopup, fire);
      };

      map.on("click", fireLayerId, openFireFromLayer);
      map.on("mouseenter", fireLayerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", fireLayerId, () => {
        map.getCanvas().style.cursor = "";
      });

      // Agent route advisories and active responder movement.
      map.addSource("evacua-agent-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "evacua-agent-route",
        type: "line",
        source: "evacua-agent-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#55B5D9",
          "line-width": 2,
          "line-opacity": 0.8,
          "line-dasharray": [1, 1.4],
        },
      });

      map.addSource("evacua-responder-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "evacua-responder-route-casing",
        type: "line",
        source: "evacua-responder-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#050506",
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "evacua-responder-route",
        type: "line",
        source: "evacua-responder-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#55B5D9",
          "line-width": 2.6,
          "line-opacity": 0.95,
        },
      });

      // Route sources/layers (empty to start)
      map.addSource("evacua-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "evacua-route-casing",
        type: "line",
        source: "evacua-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#07080a",
          "line-width": [
            "case",
            ["==", ["get", "selected"], true],
            8,
            6,
          ],
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "evacua-route",
        type: "line",
        source: "evacua-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "selected"], true],
            "#FF9E3D",
            "#55B5D9",
          ],
          "line-width": [
            "case",
            ["==", ["get", "selected"], true],
            4.2,
            2.6,
          ],
          "line-opacity": [
            "case",
            ["==", ["get", "selected"], true],
            1,
            0.7,
          ],
        },
      });

      styleReady.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (mapRef.current) map.resize();
        });
      });
    });

    mapRef.current = map;

    const el = container.current;
    const ro =
      el &&
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            requestAnimationFrame(() => {
              if (mapRef.current) map.resize();
            });
          })
        : null;
    if (el && ro) ro.observe(el);

    return () => {
      if (el && ro) ro.disconnect();
      map.remove();
      mapRef.current = null;
      homeMarker.current = null;
      destMarker.current = null;
      eventMarkers.current = [];
      eventMarkersById.current = {};
      stationMarkers.current = [];
      responderMarkers.current = [];
      fireAnimationState.current = {};
      incidentPopup.current?.remove();
      incidentPopup.current = null;
      styleReady.current = false;
    };
  }, [home]);

  // Home marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !home) return;
    if (homeMarker.current) homeMarker.current.remove();
    const el = document.createElement("div");
    el.className = "evacua-home-marker";
    el.innerHTML = `<div class="ring"></div><div class="pulse"></div><div class="core"></div>`;
    homeMarker.current = new mapboxgl.Marker({ element: el })
      .setLngLat([home.lng, home.lat])
      .addTo(map);
  }, [home]);

  // Destination marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (destMarker.current) destMarker.current.remove();
    if (!destination) return;
    const el = document.createElement("div");
    el.className = "evacua-dest-marker";
    el.innerHTML = `<div class="flag"></div>`;
    destMarker.current = new mapboxgl.Marker({ element: el })
      .setLngLat([destination.lng, destination.lat])
      .addTo(map);
  }, [destination]);

  // Hazard polygons + road closures
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const hazardSrc = map.getSource("evacua-hazards") as
        | mapboxgl.GeoJSONSource
        | undefined;
      const closureSrc = map.getSource("evacua-closures") as
        | mapboxgl.GeoJSONSource
        | undefined;

      const hazardFeatures: GeoJSON.Feature[] = [];
      const closureFeatures: GeoJSON.Feature[] = [];

      for (const ev of events ?? []) {
        if (ev.polygon && ev.polygon.length > 0) {
          const category =
            ev.kind === "fire_perimeter" || ev.kind === "fire_incident"
              ? "fire"
              : ev.kind === "evacuation_order"
                ? "evac_order"
                : ev.kind === "evacuation_warning"
                  ? "evac_warning"
                  : "other";
          hazardFeatures.push({
            type: "Feature",
            properties: { id: ev.id, kind: ev.kind, category },
            geometry: {
              type: "Polygon",
              coordinates: ev.polygon as GeoJSON.Position[][],
            },
          });
        }
        if (ev.line && ev.line.length > 1 && ev.kind === "road_closure") {
          closureFeatures.push({
            type: "Feature",
            properties: { id: ev.id },
            geometry: {
              type: "LineString",
              coordinates: ev.line as GeoJSON.Position[],
            },
          });
        }
      }

      if (hazardSrc) {
        hazardSrc.setData({
          type: "FeatureCollection",
          features: hazardFeatures,
        });
      }
      if (closureSrc) {
        closureSrc.setData({
          type: "FeatureCollection",
          features: closureFeatures,
        });
      }
    };

    if (styleReady.current) apply();
    else map.once("load", apply);
  }, [events, onFocusEvent]);

  // Route rendering
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      map.resize();
      const src = map.getSource("evacua-routes") as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (!src) return;
      const features =
        (routes ?? []).map((r) => ({
          type: "Feature" as const,
          properties: {
            id: r.id,
            selected: r.id === selectedRouteId,
          },
          geometry: {
            type: "LineString" as const,
            coordinates: r.coordinates,
          },
        })) ?? [];
      src.setData({ type: "FeatureCollection", features });

      // Fit bounds when we first get routes
      if (features.length > 0 && home) {
        const coords = features.flatMap((f) => f.geometry.coordinates).filter(
          (c): c is [number, number] =>
            Array.isArray(c) &&
            c.length >= 2 &&
            Number.isFinite(c[0]) &&
            Number.isFinite(c[1]),
        );
        if (destination) coords.push([destination.lng, destination.lat]);
        coords.push([home.lng, home.lat]);
        if (coords.length === 0) return;

        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const spanLng = maxLng - minLng;
        const spanLat = maxLat - minLat;
        const center: [number, number] = [
          (minLng + maxLng) / 2,
          (minLat + maxLat) / 2,
        ];

        // Degenerate bounds (single point / OSRM fallback line) - fitBounds fails.
        if (spanLng < 1e-8 && spanLat < 1e-8) {
          map.flyTo({
            center,
            zoom: 12,
            duration: 900,
          });
          return;
        }

        const bounds: mapboxgl.LngLatBoundsLike = [
          [minLng, minLat],
          [maxLng, maxLat],
        ];

        const mapEl = map.getContainer();
        const w = mapEl.clientWidth;
        const h = mapEl.clientHeight;
        if (w < 48 || h < 48) return;

        const padY = Math.min(80, Math.max(8, Math.floor((h - 24) / 2)));
        const padX = Math.min(40, Math.max(8, Math.floor((w - 24) / 2)));
        try {
          map.fitBounds(bounds, {
            padding: { top: padY, bottom: padY, left: padX, right: padX },
            duration: 900,
            maxZoom: 12,
          });
        } catch {
          map.flyTo({ center, zoom: 11, duration: 900 });
        }
      }
    };

    if (styleReady.current) apply();
    else map.once("load", apply);
  }, [routes, selectedRouteId, destination, home]);

  // Animated fire spread from the operations feed.
  useEffect(() => {
    if (!mapRef.current || !fireState?.fires) return;
    const map = mapRef.current;

    fireState.fires.forEach((fire) => {
      const id = String(fire.id);
      if (!fireStateRef.current[id]) {
        const seed = Math.random() * Math.PI * 2;
        const numVectors = 18; // 18 directional segments for complex organic shape
        const growthVectors = generateWindGrowthVectors(
          numVectors,
          windMph || 5,
          windDeg || 0
        );
        
        fireStateRef.current[id] = {
          baseRadius: getBaseRadiusMeters(fire),
          roughness: 0.15 + Math.random() * 0.2,
          waveSpeed: 0.25 + Math.random() * 0.4,
          amplitude: 80 + Math.random() * 120,
          expansionRate: (fire.risk_level === 'critical' ? 22 : fire.risk_level === 'high' ? 16 : 10),
          seed,
          growthVectors,
          startTime: Date.now(),
        };
      }
    });

    let frame = 0;
    let cancelled = false;
    let lastPaint = 0;

    const paint = (ts: number) => {
      if (cancelled) return;
      if (mapRef.current !== map) return;
      
      // Update at ~30fps for smooth movement but low CPU
      if (styleReady.current && ts - lastPaint > 32) {
        const src = map.getSource("evacua-fire-spread") as
          | mapboxgl.GeoJSONSource
          | undefined;
        if (src) {
          const features = (fireState?.fires ?? [])
            .filter((fire) => Number.isFinite(fire.lat) && Number.isFinite(fire.lon))
            .map((fire) => {
              const state = fireStateRef.current[fire.id];
              const animState = state ? {
                  seed: state.seed,
                  startTime: state.startTime,
                  growthVectors: state.growthVectors,
                  windKey: `${Math.round(windMph ?? 10)}:${Math.round(windDeg ?? 270)}`,
                } : getFireAnimationState(
                  fireAnimationState.current,
                  fire.id,
                  windMph ?? 10,
                  windDeg ?? 270,
                );

              return createFireSpreadFeature(fire, {
                time: ts / 1000,
                windMph: windMph ?? 10,
                windDeg: windDeg ?? 270,
                selected: fire.id === focusedEventId,
                state: animState,
                elapsedTime: (Date.now() - animState.startTime) / 1000,
              });
            });
          src.setData({ type: "FeatureCollection", features });
          lastPaint = ts;
        }
      }
      frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [fireState, focusedEventId, windMph, windDeg]);

  // Autonomous evacuation zones and route advisories.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const evacSrc = map.getSource("evacua-agent-evacuations") as
        | mapboxgl.GeoJSONSource
        | undefined;
      const routeSrc = map.getSource("evacua-agent-routes") as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (evacSrc) {
        const features = (routeOps?.evacuations ?? [])
          .map((zone) => {
            const ring = normalizeRing(zone.polygon);
            if (!ring) return null;
            return {
              type: "Feature" as const,
              properties: {
                id: zone.id,
                fireId: zone.fire_id,
                name: zone.zone_name ?? "Evacuation buffer",
              },
              geometry: {
                type: "Polygon" as const,
                coordinates: [ring],
              },
            };
          })
          .filter((f): f is NonNullable<typeof f> => Boolean(f));
        evacSrc.setData({ type: "FeatureCollection", features });
      }

      if (routeSrc) {
        const features = (routeOps?.routes ?? [])
          .map((route) => {
            const line = normalizeRouteLine(route.new_route);
            if (!line) return null;
            return {
              type: "Feature" as const,
              properties: {
                id: route.id,
                stationId: route.station_id,
                reason: route.reason,
              },
              geometry: {
                type: "LineString" as const,
                coordinates: line,
              },
            };
          })
          .filter((f): f is NonNullable<typeof f> => Boolean(f));
        routeSrc.setData({ type: "FeatureCollection", features });
      }
    };

    if (styleReady.current) apply();
    else map.once("load", apply);
  }, [routeOps]);

  // Fire station markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of stationMarkers.current) m.remove();
    stationMarkers.current = [];

    for (const station of fireState?.firestations ?? []) {
      const el = document.createElement("div");
      el.className = "evacua-station-marker";
      el.innerHTML = `<div class="station-core"></div>`;
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([station.lon, station.lat])
        .setPopup(
          new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: true,
            className: "evacua-popup",
            maxWidth: "240px",
            offset: 14,
          }).setHTML(
            `<div class="rounded-lg border border-line-subtle bg-bg-panel p-3 shadow-2xl min-w-[200px]">
              <div class="text-sm font-bold text-text-primary mb-1">${escapeHtml(station.name)}</div>
              <div class="text-[11px] text-text-secondary font-medium">${escapeHtml([station.city, station.county].filter(Boolean).join(" - "))}</div>
            </div>`,
          ),
        )
        .addTo(map);
      stationMarkers.current.push(marker);
    }
  }, [fireState?.firestations]);

  // Active responder routes and moving team markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of responderMarkers.current) m.remove();
    responderMarkers.current = [];

    const stations = new Map((fireState?.firestations ?? []).map((s) => [s.id, s]));
    const fires = new Map((fireState?.fires ?? []).map((f) => [f.id, f]));
    const features: GeoJSON.Feature[] = [];

    for (const team of responderOps?.activeResponders ?? []) {
      if (!team.incidentId || team.status === "available") continue;
      const station = stations.get(team.stationId);
      const fire = fires.get(team.incidentId);
      if (!station || !fire) continue;
      const line: [number, number][] = [
        [station.lon, station.lat],
        [fire.lon, fire.lat],
      ];
      features.push({
        type: "Feature",
        properties: {
          id: team.id,
          status: team.status,
          team: team.teamNumber,
        },
        geometry: {
          type: "LineString",
          coordinates: line,
        },
      });

      const progress = responderProgress(team, responderTick);
      const [lon, lat] = interpolateLine(line, progress);
      const el = document.createElement("div");
      el.className = "evacua-responder-marker";
      el.dataset.status = team.status;
      el.innerHTML = `<div class="truck-core">${team.teamNumber}</div>`;
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(
          new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: true,
            className: "evacua-popup",
            maxWidth: "260px",
            offset: 16,
          }).setHTML(
            `<div class="rounded-lg border border-line-subtle bg-bg-panel p-3 shadow-2xl min-w-[220px]">
              <div class="text-xs font-bold text-text-primary mb-1">Responder Team ${team.teamNumber}</div>
              <div class="text-[11px] text-text-secondary font-medium leading-relaxed">${escapeHtml(`${station.name} to ${fire.name} - ${team.status.replace("_", " ")}`)}</div>
            </div>`,
          ),
        )
        .addTo(map);
      responderMarkers.current.push(marker);
    }

    const apply = () => {
      const src = map.getSource("evacua-responder-routes") as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (src) src.setData({ type: "FeatureCollection", features });
    };
    if (styleReady.current) apply();
    else map.once("load", apply);
  }, [fireState, responderOps, responderTick]);

  // Event markers (high-impact only)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of eventMarkers.current) m.remove();
    eventMarkers.current = [];
    eventMarkersById.current = {};
    if (!events) return;
    for (const ev of events) {
      if ((ev.impact ?? 0) < 0.35) continue;
      const el = document.createElement("div");
      el.className = "evacua-event-marker";
      const tone =
        (ev.impact ?? 0) >= 0.75
          ? "severe"
          : (ev.impact ?? 0) >= 0.45
            ? "moderate"
            : "mild";
      el.dataset.tone = tone;
      el.innerHTML = `<div class="ring"></div><div class="core"></div>`;
      el.addEventListener("click", () => onFocusEvent?.(ev.id));
      const pt = representativePoint(ev);
      const media = getSignalVideo(ev);
      const mediaHtml =
        media?.type === "mp4"
          ? `<video class="popup-video" src="${escapeHtml(
              media.url,
            )}" muted loop playsinline controls oncanplay="this.play().catch(e=>console.log(e))"></video>`
          : "";
      const mk = new mapboxgl.Marker({ element: el })
        .setLngLat([pt.lng, pt.lat])
        .setPopup(
          new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: true,
            className: "evacua-popup",
            maxWidth: "260px",
            offset: 16,
          }).setHTML(
            `<div class="rounded-lg border border-line-subtle bg-bg-panel p-3 shadow-2xl max-w-[260px]">
              ${mediaHtml}
              <div class="text-sm font-bold text-text-primary mb-1 mt-2">${escapeHtml(ev.headline)}</div>
              <div class="text-[11px] text-text-secondary font-medium leading-relaxed">${escapeHtml(ev.rationale ?? "")}</div>
            </div>`,
          ),
        )
        .addTo(map);
      eventMarkers.current.push(mk);
      eventMarkersById.current[ev.id] = mk;
    }
  }, [events, onFocusEvent]);

  // Focus selected event from rail: pan + open popup.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedEventId) return;
    const fire = fireState?.fires.find((item) => item.id === focusedEventId);
    if (fire) {
      focusFireIn3d(map, fire);
      showFireIncidentPopup(map, incidentPopup, fire);
      return;
    }
    const mk = eventMarkersById.current[focusedEventId];
    const ev = events?.find((e) => e.id === focusedEventId);
    if (!ev) return;
    const pt = representativePoint(ev);
    map.flyTo({
      center: [pt.lng, pt.lat],
      zoom: Math.max(11.8, map.getZoom()),
      duration: 850,
      essential: true,
    });
    if (mk) {
      mk.togglePopup();
    }
  }, [focusedEventId, events, fireState?.fires]);

  return (
    <div className="evacua-panel relative isolate flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-bg-panel">
      {/*
        Mapbox must mount in an in-flow box with real height. An all-absolute
        tree collapses the panel’s content height → tiny canvas (thin strip).
      */}
      <div
        ref={MAPBOX_TOKEN ? container : undefined}
        className="evacua-map-mount relative z-0 min-h-0 w-full flex-1 basis-0 overflow-hidden"
      >
        {!MAPBOX_TOKEN && (
          <div className="flex h-full min-h-[420px] items-center justify-center bg-black/40 p-6 text-center">
            <div className="max-w-[320px]">
              <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-cyan/60" />
              <p className="text-sm font-semibold text-white">Map source unavailable</p>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                Set NEXT_PUBLIC_MAPBOX_TOKEN, or run demo mode with EVACUA_DEMO_MODE=true to use the bundled demo map token.
              </p>
            </div>
          </div>
        )}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-lg shadow-[inset_0_0_160px_rgba(0,0,0,0.65)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 rounded-t-lg bg-linear-to-b from-bg-panel to-transparent opacity-70"
      />
      <style jsx global>{`
        .evacua-map-mount .mapboxgl-map,
        .evacua-map-mount .mapboxgl-canvas-container,
        .evacua-map-mount canvas.mapboxgl-canvas {
          width: 100% !important;
          height: 100% !important;
          max-width: none !important;
          max-height: none !important;
        }
        .evacua-home-marker {
          position: relative;
          width: 36px;
          height: 36px;
          pointer-events: none;
        }
        .evacua-home-marker .ring {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 1px solid color-mix(in oklab, var(--color-cyan) 55%, transparent);
        }
        .evacua-home-marker .pulse {
          position: absolute;
          inset: 6px;
          border-radius: 999px;
          background: color-mix(in oklab, var(--color-cyan) 30%, transparent);
          animation: evacua-home-pulse 2.8s var(--ease-premium) infinite;
        }
        .evacua-home-marker .core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--color-cyan);
          box-shadow:
            0 0 0 3px color-mix(in oklab, var(--color-cyan) 20%, transparent),
            0 0 18px color-mix(in oklab, var(--color-cyan) 60%, transparent);
          transform: translate(-50%, -50%);
        }
        @keyframes evacua-home-pulse {
          0% {
            transform: scale(0.6);
            opacity: 0.7;
          }
          100% {
            transform: scale(1.7);
            opacity: 0;
          }
        }
        .evacua-dest-marker {
          width: 22px;
          height: 22px;
          pointer-events: none;
        }
        .evacua-dest-marker .flag {
          width: 100%;
          height: 100%;
          border-radius: 6px;
          background: color-mix(in oklab, var(--color-ember) 90%, black);
          box-shadow:
            0 0 0 3px color-mix(in oklab, var(--color-ember) 15%, transparent),
            0 0 24px color-mix(in oklab, var(--color-ember) 55%, transparent);
          transform: rotate(45deg);
        }
        .evacua-event-marker {
          position: relative;
          width: 22px;
          height: 22px;
          cursor: pointer;
        }
        .evacua-event-marker .ring {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 1px solid;
        }
        .evacua-event-marker .core {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          transform: translate(-50%, -50%);
        }
        .evacua-event-marker[data-tone="severe"] .ring {
          border-color: color-mix(in oklab, var(--color-red) 55%, transparent);
        }
        .evacua-event-marker[data-tone="severe"] .core {
          background: var(--color-red);
          box-shadow: 0 0 14px color-mix(in oklab, var(--color-red) 60%, transparent);
        }
        .evacua-event-marker[data-tone="moderate"] .ring {
          border-color: color-mix(in oklab, var(--color-ember) 55%, transparent);
        }
        .evacua-event-marker[data-tone="moderate"] .core {
          background: var(--color-ember);
          box-shadow: 0 0 14px color-mix(in oklab, var(--color-ember) 60%, transparent);
        }
        .evacua-event-marker[data-tone="mild"] .ring {
          border-color: color-mix(in oklab, var(--color-amber) 55%, transparent);
        }
        .evacua-event-marker[data-tone="mild"] .core {
          background: var(--color-amber);
          box-shadow: 0 0 14px color-mix(in oklab, var(--color-amber) 50%, transparent);
        }
        .evacua-station-marker {
          width: 22px;
          height: 22px;
          cursor: pointer;
        }
        .evacua-station-marker .station-core {
          position: relative;
          width: 22px;
          height: 22px;
          border-radius: 7px;
          border: 1px solid color-mix(in oklab, var(--color-cyan) 65%, transparent);
          background:
            linear-gradient(135deg, color-mix(in oklab, var(--color-cyan) 20%, transparent), transparent),
            var(--color-bg-panel);
          box-shadow:
            0 0 0 3px color-mix(in oklab, var(--color-cyan) 10%, transparent),
            0 0 18px color-mix(in oklab, var(--color-cyan) 25%, transparent);
        }
        .evacua-station-marker .station-core::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 10px;
          height: 2px;
          border-radius: 999px;
          background: var(--color-cyan);
          transform: translate(-50%, -50%);
          box-shadow: 0 -4px 0 var(--color-cyan), 0 4px 0 var(--color-cyan);
        }
        .evacua-responder-marker {
          width: 28px;
          height: 28px;
          cursor: pointer;
        }
        .evacua-responder-marker .truck-core {
          display: flex;
          width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid color-mix(in oklab, var(--color-ember) 70%, transparent);
          background: var(--color-bg-elev);
          color: var(--color-ember);
          font: 10px/1 var(--font-mono);
          box-shadow:
            0 0 0 3px color-mix(in oklab, var(--color-ember) 13%, transparent),
            0 0 20px color-mix(in oklab, var(--color-ember) 35%, transparent);
        }
        .evacua-responder-marker[data-status="on_scene"] .truck-core {
          border-color: color-mix(in oklab, var(--color-cyan) 70%, transparent);
          color: var(--color-cyan);
          box-shadow:
            0 0 0 3px color-mix(in oklab, var(--color-cyan) 13%, transparent),
            0 0 20px color-mix(in oklab, var(--color-cyan) 35%, transparent);
        }
        .mapboxgl-ctrl-attrib {
          background: color-mix(in oklab, var(--color-bg-oled) 90%, transparent) !important;
          border: 1px solid var(--color-line-subtle) !important;
          border-radius: 999px !important;
          padding: 2px 10px !important;
          font-size: 10.5px !important;
        }
        .mapboxgl-ctrl-attrib a {
          color: var(--color-text-muted) !important;
        }
        .mapboxgl-ctrl-group {
          background: var(--color-bg-panel) !important;
          border: 1px solid var(--color-line-subtle) !important;
          box-shadow: none !important;
          border-radius: 12px !important;
          overflow: hidden;
        }
        .mapboxgl-ctrl-group button {
          background: transparent !important;
        }
        .mapboxgl-ctrl-group button:hover {
          background: color-mix(in oklab, white 4%, transparent) !important;
        }
        .mapboxgl-ctrl-group button .mapboxgl-ctrl-icon {
          filter: invert(0.78);
        }
        .evacua-popup .mapboxgl-popup-content {
          background: transparent !important;
          border: none !important;
          padding: 0 !important;
          box-shadow: none !important;
          font-family: var(--font-sans) !important;
        }
        .evacua-popup .mapboxgl-popup-tip {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

function getFireAnimationState(
  store: Record<string, FireAnimationState>,
  id: string,
  windMph: number,
  windDeg: number,
) {
  const windKey = `${Math.round(windMph)}:${Math.round(windDeg)}`;
  if (!store[id] || store[id].windKey !== windKey) {
    store[id] = {
      seed: Math.random() * 10000,
      startTime: Date.now(),
      growthVectors: generateWindGrowthVectors(72, windMph, windDeg),
      windKey,
    };
  }
  return store[id];
}

function generateWindGrowthVectors(num: number, windSpeed: number, windDirection: number) {
  const fireSpreadDirection = ((windDirection + 180) % 360) * (Math.PI / 180);
  const windInfluence = Math.min(windSpeed / 25, 1);
  const vectors = [];
  for (let i = 0; i < num; i++) {
    const angle = (i / num) * Math.PI * 2;
    const alignment = Math.cos(angle - fireSpreadDirection);
    const windEffect = 0.6 + (alignment * windInfluence * 0.8);
    const randomVar = 0.85 + Math.random() * 0.3;
    vectors.push(windEffect * randomVar);
  }
  return vectors;
}

function getIntensityMultiplier(risk: string) {
  switch (risk) {
    case 'critical': return 1.3;
    case 'high': return 1.15;
    case 'medium': return 0.95;
    default: return 0.8;
  }
}

function getBaseRadiusMeters(fire: FireOpsState["fires"][number] & { acres?: number }) {
  if (fire.acres && fire.acres > 0) {
    // 1 acre = 4046.86 square meters. Area = pi * r^2
    return Math.sqrt((fire.acres * 4046.86) / Math.PI);
  }
  const intensityMultiplier = getIntensityMultiplier(fire.risk_level);
  
  // Use a deterministic seed from the ID to avoid per-frame jitter
  const idSeed = typeof fire.id === 'string' 
    ? fire.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) 
    : Number(fire.id || 0);
    
  const base = 250 + (idSeed % 100);
  return base * intensityMultiplier;
}

function noise(x: number, y: number, seed: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function multiNoise(x: number, y: number, seed: number, octaves = 4) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x * frequency, y * frequency, seed + i) * amplitude;
    max += amplitude;
    amplitude *= 0.45;
    frequency *= 2.1;
  }
  return value / max;
}

function createFireSpreadFeature(
  fire: FireOpsState["fires"][number],
  options: {
    time: number;
    state: FireAnimationState;
    windMph: number;
    windDeg: number;
    selected?: boolean;
    elapsedTime?: number;
  },
): GeoJSON.Feature<GeoJSON.Polygon> {
  const radiusMeters = getBaseRadiusMeters(fire);
  const intensity = 0.65 + 0.08 * Math.abs(Math.sin(options.time * 0.4 + options.state.seed));

  return {
    type: "Feature" as const,
    properties: {
      id: fire.id,
      name: fire.name,
      risk: fire.risk_level,
      intensity,
      containment: fire.containment,
      selected: options.selected ?? false,
      radiusMeters,
    },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        generateFireRing([fire.lon, fire.lat], radiusMeters, {
          seed: options.state.seed,
          time: options.time,
          growthVectors: options.state.growthVectors,
          elapsedTime: options.elapsedTime ?? 100, // Default to stable if not provided
        }),
      ],
    },
  };
}

function generateFireRing(
  center: [number, number],
  radiusMeters: number,
  {
    seed,
    time,
    growthVectors,
    elapsedTime = 100,
  }: {
    seed: number;
    time: number;
    growthVectors: number[];
    elapsedTime?: number;
  },
) {
  const coords: [number, number][] = [];
  const points = 64;
  const latRadians = (center[1] * Math.PI) / 180;
  const cosLat = Math.max(0.15, Math.cos(latRadians));

  // Emerge from center over 8 seconds
  const emergenceFactor = Math.min(elapsedTime / 8, 1);

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const vectorIndex = Math.floor((i / points) * growthVectors.length);
    const growthVector = growthVectors[vectorIndex] ?? 1.0;
    
    // Stable organic variation from noise
    const noiseValue = multiNoise(
      Math.cos(angle) * 2,
      Math.sin(angle) * 2,
      seed,
      4
    );
    
    // Subtle breathing effect
    const subtleMovement = 1 + Math.sin(angle * 3 + time * 0.2 + seed) * 0.01;
    
    const irregularity = 0.8 + (noiseValue * 0.4 * 0.8);
    const effectiveRadius = radiusMeters * emergenceFactor * growthVector * irregularity * subtleMovement;

    const dx = Math.cos(angle) * effectiveRadius;
    const dy = Math.sin(angle) * effectiveRadius;
    coords.push([
      center[0] + dx / (METERS_PER_DEGREE_LAT * cosLat),
      center[1] + dy / METERS_PER_DEGREE_LAT,
    ]);
  }

  if (coords.length) coords.push(coords[0]);
  return coords;
}

function normalizeRing(input: unknown): [number, number][] | null {
  if (!Array.isArray(input)) return null;
  const ring = input
    .map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      return [lng, lat] as [number, number];
    })
    .filter((point): point is [number, number] => Boolean(point));
  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return ring;
}

function normalizeRouteLine(input: unknown): [number, number][] | null {
  if (!input || typeof input !== "object") return null;
  const route = input as {
    waypoints?: unknown;
    from?: unknown;
    to?: unknown;
    geometry?: { coordinates?: unknown };
  };
  const fromGeometry = normalizeLine(route.geometry?.coordinates);
  if (fromGeometry) return fromGeometry;
  const waypoints = normalizeLine(route.waypoints);
  if (waypoints) return waypoints;
  const from = normalizePoint(route.from);
  const to = normalizePoint(route.to);
  if (from && to) return [from, to];
  return null;
}

function normalizeLine(input: unknown): [number, number][] | null {
  if (!Array.isArray(input)) return null;
  const line = input
    .map(normalizePoint)
    .filter((point): point is [number, number] => Boolean(point));
  return line.length >= 2 ? line : null;
}

function normalizePoint(input: unknown): [number, number] | null {
  if (!Array.isArray(input) || input.length < 2) return null;
  const lng = Number(input[0]);
  const lat = Number(input[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function responderProgress(
  team: ResponderOpsState["activeResponders"][number],
  now: number,
) {
  if (team.status === "on_scene") return 1;
  const start = team.dispatchedAt ? Date.parse(team.dispatchedAt) : Number.NaN;
  const eta = team.etaIso ? Date.parse(team.etaIso) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(eta) || eta <= start) {
    return team.status === "en_route" ? 0.66 : 0.25;
  }
  return Math.max(0.05, Math.min(0.98, (now - start) / (eta - start)));
}

function interpolateLine(line: [number, number][], progress: number): [number, number] {
  if (line.length === 0) return [0, 0];
  if (line.length === 1) return line[0];
  const p = Math.max(0, Math.min(1, progress));
  const [a, b] = [line[0], line[line.length - 1]];
  return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p];
}

function installDetailedMapbox3dContext(map: MapboxMap) {
  if (!map.getSource("mapbox-dem")) {
    map.addSource("mapbox-dem", {
      type: "raster-dem",
      url: "mapbox://mapbox.terrain-rgb",
      tileSize: 512,
      maxzoom: 14,
    });
  }

  map.setTerrain({
    source: "mapbox-dem",
    exaggeration: 1.55,
  });

  const styleLayers = map.getStyle().layers ?? [];
  const firstSymbolLayerId = styleLayers.find(
    (layer) => layer.type === "symbol" && Boolean(layer.layout?.["text-field"]),
  )?.id;

  if (!map.getLayer("evacua-mapbox-3d-buildings")) {
    const buildingLayer: mapboxgl.AnyLayer = {
      id: "evacua-mapbox-3d-buildings",
      source: "composite",
      "source-layer": "building",
      filter: ["==", "extrude", "true"],
      type: "fill-extrusion",
      minzoom: 11,
      paint: {
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          "#1A2029",
          14,
          "#303A46",
          17,
          "#657383",
        ],
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          0,
          14,
          ["get", "height"],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          0,
          14,
          ["get", "min_height"],
        ],
        "fill-extrusion-opacity": 0.72,
        "fill-extrusion-vertical-gradient": true,
      },
    };
    map.addLayer(buildingLayer, firstSymbolLayerId);
  }

  // Mapbox fog intermittently throws during pitch/terrain evaluation in the
  // in-app browser runtime. The panel already applies its tactical atmosphere
  // through CSS overlays, so keep the map layer stack deterministic here.
}

function focusFireIn3d(
  map: MapboxMap,
  fire: Pick<FireOpsState["fires"][number], "lat" | "lon" | "estimated_radius">,
) {
  const radiusKm = Math.max(0.1, fire.estimated_radius / 1000);
  const zoom = radiusKm > 3.5 ? 14.65 : radiusKm > 1.5 ? 15.35 : 16.15;
  map.flyTo({
    center: [fire.lon, fire.lat],
    zoom,
    pitch: 68,
    bearing: map.getBearing() || -24,
    duration: 2200,
    padding: { top: 160, bottom: 44, left: 44, right: 44 },
    essential: true,
  });
}

function showFireIncidentPopup(map: mapboxgl.Map, popupRef: React.MutableRefObject<mapboxgl.Popup | null>, fire: FireOpsState["fires"][number]) {
  if (popupRef.current) popupRef.current.remove();

  const videoInfo = getFireVideo(fire.name);
  const hasVideo = Boolean(videoInfo?.videoUrl);
  const intensityColor = 
    fire.risk_level === "critical" ? "#FF6B00" :
    fire.risk_level === "high" ? "#FF4444" :
    fire.risk_level === "medium" ? "#FF8C00" : "#00C2FF";

  const popupHtml = `
    <div class="rounded-lg overflow-hidden bg-[#0A0B0E]/95 border border-white/10 backdrop-blur-md shadow-2xl" style="min-width: 320px;">
      <div class="px-4 pt-3 pb-2 bg-black/40 border-b border-white/5">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full animate-pulse" style="background-color: ${intensityColor}"></div>
          <h3 class="text-sm font-bold text-white tracking-tight uppercase">${escapeHtml(fire.name)}</h3>
        </div>
        <p class="mt-1 text-[11px] font-medium leading-relaxed" style="color: ${intensityColor}">${escapeHtml(fire.description)}</p>
      </div>

      ${hasVideo ? `
        <div class="relative w-full h-[160px] bg-black">
          <video 
            autoplay muted playsinline loop
            class="w-full h-full object-cover"
            poster="${videoInfo?.thumbnailUrl || ''}"
          >
            <source src="${videoInfo?.videoUrl}" type="video/mp4">
          </video>
          <div class="absolute top-2 left-2 px-2 py-0.5 bg-red-600 rounded text-[10px] font-bold text-white uppercase tracking-wider animate-pulse">Live Feed</div>
        </div>
      ` : `
        <div class="px-4 py-4 bg-black/20 text-center">
          <p class="text-[11px] font-bold uppercase tracking-widest text-white/30 italic">No Satellite Feed Available</p>
        </div>
      `}

      <div class="p-4 space-y-3">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col">
            <span class="text-[10px] text-white/40 font-bold uppercase tracking-tighter">Containment</span>
            <span class="text-sm font-black text-[#00C2FF]">${Math.round(fire.containment)}%</span>
          </div>
          <div class="flex flex-col text-right">
            <span class="text-[10px] text-white/40 font-bold uppercase tracking-tighter">Intensity</span>
            <span class="text-sm font-black uppercase" style="color: ${intensityColor}">${fire.risk_level}</span>
          </div>
        </div>
        
        <div class="h-px bg-linear-to-r from-transparent via-white/10 to-transparent"></div>

        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col">
            <span class="text-[9px] text-white/30 font-bold uppercase">Estimated Radius</span>
            <span class="text-xs font-mono text-white/80">${(fire.estimated_radius / 1000).toFixed(2)} km</span>
          </div>
          <div class="flex flex-col text-right">
            <span class="text-[9px] text-white/30 font-bold uppercase">Growth Rate</span>
            <span class="text-xs font-mono text-white/80">+${fire.growth_rate}m/s</span>
          </div>
        </div>
      </div>
    </div>
  `;

  popupRef.current = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: true,
    className: "evacua-popup",
    maxWidth: "340px",
    offset: 20,
    anchor: "bottom",
  })
    .setLngLat([fire.lon, fire.lat])
    .setHTML(popupHtml)
    .addTo(map);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
