"use client";

import { useEffect, useRef } from "react";
import maplibregl, {
  type Map as MapLibreMap,
  type Marker,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { EVACUA_STYLE_URL, applyOledOverrides } from "@/lib/map/style";
import type { LatLng } from "@/lib/schemas/household";

type Props = {
  home?: LatLng | null;
  destination?: LatLng | null;
};

export function MapPanel({ home, destination }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const homeMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const center: [number, number] = home
      ? [home.lng, home.lat]
      : [-119.417932, 36.778259]; // CA centroid fallback

    const map = new maplibregl.Map({
      container: container.current,
      style: EVACUA_STYLE_URL,
      center,
      zoom: home ? 12 : 5.6,
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
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      homeMarker.current = null;
      destMarker.current = null;
    };
  }, [home]);

  // Home marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !home) return;

    if (homeMarker.current) homeMarker.current.remove();

    const el = document.createElement("div");
    el.className = "evacua-home-marker";
    el.innerHTML = `
      <div class="ring"></div>
      <div class="pulse"></div>
      <div class="core"></div>
    `;

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

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]">
      <div ref={container} className="absolute inset-0" />
      {/* Soft inner vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_160px_rgba(0,0,0,0.65)]"
      />
      {/* Subtle top-down fade for labels legibility */}
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
      `}</style>
    </div>
  );
}
