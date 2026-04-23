"use client";

import { useEffect, useRef } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { EVACUA_STYLE_URL, applyOledOverrides } from "@/lib/map/style";
import type { LatLng } from "@/lib/schemas/household";
import type { RouteGeometry } from "@/lib/schemas/plan";
import type { CrisisEvent } from "@/lib/schemas/crisis";

type Props = {
  home?: LatLng | null;
  destination?: LatLng | null;
  routes?: RouteGeometry[];
  selectedRouteId?: string;
  events?: CrisisEvent[];
};

export function MapPanel({
  home,
  destination,
  routes,
  selectedRouteId,
  events,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const homeMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const eventMarkers = useRef<Marker[]>([]);
  const styleReady = useRef(false);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const center: [number, number] = home
      ? [home.lng, home.lat]
      : [-119.417932, 36.778259];

    const map = new maplibregl.Map({
      container: container.current,
      style: EVACUA_STYLE_URL,
      center,
      zoom: home ? 11.5 : 5.6,
      minZoom: 4,
      maxZoom: 16,
      attributionControl: false,
      cooperativeGestures: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          '<span style="color:#6b7380">© OpenStreetMap · OpenFreeMap</span>',
      }),
      "bottom-left",
    );

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
        visualizePitch: false,
      }),
      "bottom-right",
    );

    map.on("load", () => {
      applyOledOverrides(map);

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
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      homeMarker.current = null;
      destMarker.current = null;
      eventMarkers.current = [];
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
    homeMarker.current = new maplibregl.Marker({ element: el })
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
    destMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat([destination.lng, destination.lat])
      .addTo(map);
  }, [destination]);

  // Route rendering
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource("evacua-routes") as
        | maplibregl.GeoJSONSource
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
        const coords = features.flatMap((f) => f.geometry.coordinates);
        if (destination) coords.push([destination.lng, destination.lat]);
        coords.push([home.lng, home.lat]);
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        const bounds: maplibregl.LngLatBoundsLike = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ];
        map.fitBounds(bounds, {
          padding: { top: 80, bottom: 80, left: 40, right: 40 },
          duration: 900,
          maxZoom: 12,
        });
      }
    };

    if (styleReady.current) apply();
    else map.once("load", apply);
  }, [routes, selectedRouteId, destination, home]);

  // Event markers (high-impact only)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of eventMarkers.current) m.remove();
    eventMarkers.current = [];
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
      const mk = new maplibregl.Marker({ element: el })
        .setLngLat([ev.centroid.lng, ev.centroid.lat])
        .setPopup(
          new maplibregl.Popup({
            closeButton: false,
            closeOnClick: true,
            className: "evacua-popup",
            maxWidth: "260px",
            offset: 16,
          }).setHTML(
            `<div class="popup-body"><div class="h">${escapeHtml(
              ev.headline,
            )}</div><div class="m">${escapeHtml(
              ev.rationale ?? "",
            )}</div></div>`,
          ),
        )
        .addTo(map);
      eventMarkers.current.push(mk);
    }
  }, [events]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]">
      <div ref={container} className="absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_160px_rgba(0,0,0,0.65)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-2xl bg-gradient-to-b from-[var(--color-bg-panel)] to-transparent opacity-70"
      />
      <style jsx global>{`
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
        .maplibregl-ctrl-attrib {
          background: color-mix(in oklab, var(--color-bg-oled) 90%, transparent) !important;
          border: 1px solid var(--color-line-subtle) !important;
          border-radius: 999px !important;
          padding: 2px 10px !important;
          font-size: 10.5px !important;
        }
        .maplibregl-ctrl-attrib a {
          color: var(--color-text-muted) !important;
        }
        .maplibregl-ctrl-group {
          background: var(--color-bg-panel) !important;
          border: 1px solid var(--color-line-subtle) !important;
          box-shadow: none !important;
          border-radius: 12px !important;
          overflow: hidden;
        }
        .maplibregl-ctrl-group button {
          background: transparent !important;
        }
        .maplibregl-ctrl-group button:hover {
          background: color-mix(in oklab, white 4%, transparent) !important;
        }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon {
          filter: invert(0.78);
        }
        .evacua-popup .maplibregl-popup-content {
          background: var(--color-bg-elev) !important;
          border: 1px solid var(--color-line-subtle) !important;
          border-radius: 12px !important;
          padding: 12px !important;
          font-family: var(--font-sans) !important;
        }
        .evacua-popup .maplibregl-popup-tip {
          display: none !important;
        }
        .evacua-popup .popup-body .h {
          color: var(--color-text-primary);
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 4px;
        }
        .evacua-popup .popup-body .m {
          color: var(--color-text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }
      `}</style>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
