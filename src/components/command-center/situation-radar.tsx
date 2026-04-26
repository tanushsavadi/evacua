"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Compass } from "lucide-react";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { LatLng } from "@/lib/geo/types";
import { representativePoint } from "@/lib/geo/representative-point";
import { cn } from "@/lib/utils";

type Props = {
  home: LatLng | null;
  events: CrisisEvent[];
};

// Compute great-circle distance (km) + initial bearing (deg, 0 = North, CW).
function bearingDistanceKm(
  from: LatLng,
  to: LatLng,
): { km: number; bearingDeg: number } {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δφ = toRad(to.lat - from.lat);
  const Δλ = toRad(to.lng - from.lng);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R * c;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const bearingDeg = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return { km, bearingDeg };
}

function severityTone(ev: CrisisEvent) {
  const impact = ev.impact ?? 0;
  if (impact >= 0.75 || ev.severity === "extreme")
    return { fill: "var(--color-red)", ring: "rgba(226,86,86,0.45)" };
  if (impact >= 0.45 || ev.severity === "severe")
    return { fill: "var(--color-ember)", ring: "rgba(255,158,61,0.45)" };
  if (ev.severity === "moderate")
    return { fill: "var(--color-amber)", ring: "rgba(245,176,65,0.35)" };
  return { fill: "var(--color-cyan)", ring: "rgba(110,231,249,0.3)" };
}

export function SituationRadar({ home, events }: Props) {
  const placed = useMemo(() => {
    if (!home) return [] as Array<{
      id: string;
      km: number;
      bearingDeg: number;
      ev: CrisisEvent;
    }>;
    return events
      .map((ev) => {
        const pt = representativePoint(ev);
        const { km, bearingDeg } = bearingDistanceKm(home, pt);
        return { id: ev.id, km, bearingDeg, ev };
      })
      .filter((e) => Number.isFinite(e.km))
      .sort((a, b) => (b.ev.impact ?? 0) - (a.ev.impact ?? 0));
  }, [home, events]);

  const maxKm = Math.max(
    10,
    Math.min(80, Math.ceil((placed[0]?.km ?? 10) * 1.25)),
  );

  const SIZE = 192;
  const CENTER = SIZE / 2;
  const PAD = 14;
  const R = CENTER - PAD;

  const rings = [0.33, 0.66, 1].map((t) => ({
    r: R * t,
    label: `${(maxKm * t).toFixed(0)}`,
  }));

  const topEvent = placed[0]?.ev;
  const topTone = topEvent ? severityTone(topEvent) : null;

  return (
    <section className="evacua-panel flex flex-col overflow-hidden rounded-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
          <Compass className="h-3 w-3" strokeWidth={1.75} />
          Situation radar
        </div>
        <span className="font-mono text-[10.5px] uppercase text-[var(--color-text-muted)]">
          {placed.length}
          <span className="mx-1 opacity-50">/</span>
          {maxKm}km
        </span>
      </div>

      <div className="relative flex items-center justify-center px-2 py-3">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          aria-hidden
          preserveAspectRatio="xMidYMid meet"
          className="block max-w-full"
        >
          <defs>
            <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-bg-oled)" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--color-bg-oled)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="sweep" x1="50%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="var(--color-cyan)" stopOpacity="0" />
              <stop offset="70%" stopColor="var(--color-cyan)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0" />
            </linearGradient>
            <mask id="radar-mask">
              <rect width={SIZE} height={SIZE} fill="black" />
              <circle cx={CENTER} cy={CENTER} r={R} fill="white" />
            </mask>
          </defs>

          <circle cx={CENTER} cy={CENTER} r={R} fill="url(#radar-bg)" />

          {rings.map((ring, i) => (
            <circle
              key={i}
              cx={CENTER}
              cy={CENTER}
              r={ring.r}
              fill="none"
              stroke="var(--color-line-subtle)"
              strokeOpacity={i === rings.length - 1 ? 0.6 : 0.35}
              strokeWidth={i === rings.length - 1 ? 1 : 0.75}
            />
          ))}

          <line
            x1={CENTER}
            y1={PAD}
            x2={CENTER}
            y2={SIZE - PAD}
            stroke="var(--color-line-subtle)"
            strokeOpacity={0.2}
          />
          <line
            x1={PAD}
            y1={CENTER}
            x2={SIZE - PAD}
            y2={CENTER}
            stroke="var(--color-line-subtle)"
            strokeOpacity={0.2}
          />

          <g mask="url(#radar-mask)">
            <motion.g
              style={{ originX: `${CENTER}px`, originY: `${CENTER}px` }}
              animate={{ rotate: 360 }}
              transition={{ duration: 6, ease: "linear", repeat: Infinity }}
            >
              <path
                d={`M ${CENTER} ${CENTER} L ${CENTER + R} ${CENTER} A ${R} ${R} 0 0 0 ${
                  CENTER + R * Math.cos(-Math.PI / 3)
                } ${CENTER + R * Math.sin(-Math.PI / 3)} Z`}
                fill="url(#sweep)"
              />
            </motion.g>
          </g>

          {/* Compass labels */}
          {[
            { label: "N", x: CENTER, y: PAD - 2, anchor: "middle" as const },
            { label: "E", x: SIZE - PAD + 4, y: CENTER + 3, anchor: "start" as const },
            { label: "S", x: CENTER, y: SIZE - PAD + 10, anchor: "middle" as const },
            { label: "W", x: PAD - 4, y: CENTER + 3, anchor: "end" as const },
          ].map((l) => (
            <text
              key={l.label}
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              className="font-mono"
              fontSize="8"
              fill="var(--color-text-muted)"
              letterSpacing="0.18em"
            >
              {l.label}
            </text>
          ))}

          {/* Ring distance labels */}
          {rings.map((ring, i) => (
            <text
              key={`rl-${i}`}
              x={CENTER + 3}
              y={CENTER - ring.r + 9}
              fontSize="7.5"
              fill="var(--color-text-muted)"
              opacity={0.6}
              className="font-mono"
            >
              {ring.label}
            </text>
          ))}

          {/* Home dot */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={4.5}
            fill="var(--color-cyan)"
            opacity={0.9}
          />
          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r={4.5}
            fill="none"
            stroke="var(--color-cyan)"
            strokeOpacity={0.6}
            animate={{ r: [4.5, 14], opacity: [0.6, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
          />

          {/* Event dots */}
          {placed.map(({ id, km, bearingDeg, ev }) => {
            if (km > maxKm) return null;
            // Bearing: 0=N, 90=E. SVG y grows downward.
            const θ = ((bearingDeg - 90) * Math.PI) / 180;
            const r = (km / maxKm) * R;
            const x = CENTER + r * Math.cos(θ);
            const y = CENTER + r * Math.sin(θ);
            const tone = severityTone(ev);
            const isTop = ev.id === topEvent?.id;
            return (
              <g key={id}>
                {isTop && (
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={5}
                    fill="none"
                    stroke={tone.fill}
                    strokeOpacity={0.6}
                    animate={{ r: [4, 12], opacity: [0.6, 0] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isTop ? 3.2 : 2.4}
                  fill={tone.fill}
                  stroke={tone.ring}
                  strokeWidth={isTop ? 1.25 : 0.75}
                />
              </g>
            );
          })}
        </svg>

        {placed.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="rounded-lg border border-white/[0.08] bg-black/65 px-3 py-1 text-center font-mono text-[10px] uppercase text-[var(--color-text-muted)] backdrop-blur-sm">
              Quiet - no threats
            </p>
          </div>
        )}
      </div>

      {topEvent && topTone && (
        <div className="border-t border-[var(--color-line-subtle)]/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: topTone.fill }}
            />
            <span className="font-mono text-[10.5px] uppercase text-[var(--color-text-muted)]">
              Nearest threat
            </span>
            <span className="ml-auto font-mono text-[10.5px] tabular-nums text-[var(--color-text-muted)]">
              {placed[0]!.km.toFixed(1)}km / {Math.round(placed[0]!.bearingDeg)} deg
            </span>
          </div>
          <p
            className={cn(
              "mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--color-text-primary)]",
            )}
          >
            {topEvent.headline}
          </p>
        </div>
      )}
    </section>
  );
}
