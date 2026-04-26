"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Wind, Route as RouteIcon, Zap, AlertTriangle, Activity } from "lucide-react";
import { SourceChip, type SourceKey } from "./source-chip";
import type { CrisisEvent, CrisisKind } from "@/lib/schemas/crisis";
import { cn } from "@/lib/utils";

const ICON_FOR: Record<CrisisKind, React.ElementType> = {
  fire_perimeter: Flame,
  fire_incident: Flame,
  weather_alert: Wind,
  red_flag: Wind,
  evacuation_order: AlertTriangle,
  evacuation_warning: AlertTriangle,
  road_closure: RouteIcon,
  power_shutoff: Zap,
};

export function SignalsRail({
  events,
  mode,
  isFetching,
  selectedEventId,
  onSelectEvent,
  opsIncidents,
}: {
  events: CrisisEvent[];
  mode: "live";
  isFetching: boolean;
  selectedEventId?: string;
  onSelectEvent?: (eventId: string) => void;
  opsIncidents?: Array<{
    id: string;
    name: string;
    risk_level: string;
    containment: number;
  }>;
}) {
  const [sortBy, setSortBy] = useState<"impact" | "recent">("impact");
  const [filter, setFilter] = useState<"all" | "critical" | "high" | "moderate">("all");

  const rendered = useMemo(() => {
    const base = events.slice().filter((ev) => {
      const impact = ev.impact ?? 0;
      const band = impact >= 0.75 ? "critical" : impact >= 0.45 ? "high" : "moderate";
      return filter === "all" ? true : band === filter;
    });
    base.sort((a, b) => {
      if (sortBy === "recent") return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
      return (b.impact ?? 0) - (a.impact ?? 0);
    });
    return base;
  }, [events, filter, sortBy]);

  return (
    <section className="evacua-panel flex h-full flex-col overflow-hidden rounded-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
          <Activity className="h-3 w-3" strokeWidth={1.75} />
          Active incidents
          {isFetching && (
            <span className="ml-1 inline-block h-1 w-1 animate-pulse rounded-full bg-[var(--color-cyan)]" />
          )}
        </div>
        <span className="font-mono text-[10.5px] uppercase text-[var(--color-text-muted)]">
          {mode === "live" ? "live" : "offline"}
        </span>
      </div>

      {opsIncidents && opsIncidents.length > 0 && (
        <div className="border-b border-white/[0.06] px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
            Incident board
          </div>
          <div className="space-y-1">
            {opsIncidents.slice(0, 2).map((inc) => (
              <div
                key={inc.id}
                className="rounded-lg border border-white/[0.07] bg-black/25 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[12px] text-[var(--color-text-primary)]">{inc.name}</p>
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase",
                      inc.risk_level === "critical"
                        ? "border-[var(--color-red)]/35 text-[var(--color-red)]"
                        : inc.risk_level === "high"
                          ? "border-[var(--color-ember)]/35 text-[var(--color-ember)]"
                          : "border-[var(--color-cyan)]/35 text-[var(--color-cyan)]",
                    )}
                  >
                    {inc.risk_level}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                  containment {Math.round(inc.containment)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2">
        <button
          type="button"
          onClick={() => setSortBy((v) => (v === "impact" ? "recent" : "impact"))}
          className="rounded-lg border border-white/[0.08] bg-black/25 px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-text-muted)]"
        >
          sort {sortBy}
        </button>
        {(["all", "critical", "high", "moderate"] as const).map((band) => (
          <button
            key={band}
            type="button"
            onClick={() => setFilter(band)}
            className={cn(
              "rounded-lg border px-2 py-0.5 font-mono text-[10px] uppercase",
              filter === band
                ? "border-[var(--color-cyan)]/40 text-[var(--color-cyan)]"
                : "border-[var(--color-line-subtle)] text-[var(--color-text-muted)]",
            )}
          >
            {band}
          </button>
        ))}
      </div>

      {rendered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="max-w-[32ch] text-[13.5px] leading-relaxed text-[var(--color-text-muted)]">
            No active incidents in range. Monitoring remains live and will
            update automatically.
          </p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-white/[0.06] overflow-y-auto">
          <AnimatePresence initial={false}>
            {rendered.map((ev) => {
              const Icon = ICON_FOR[ev.kind] ?? Activity;
              const impact = ev.impact ?? 0;
              const impactPct = Math.round(impact * 100);
              const severityTone =
                impact >= 0.75
                  ? "text-[var(--color-red)]"
                  : impact >= 0.45
                    ? "text-[var(--color-ember)]"
                    : "text-[var(--color-text-secondary)]";
              return (
                <motion.li
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="group px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => onSelectEvent?.(ev.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                      selectedEventId === ev.id
                        ? "border border-[var(--color-cyan)]/35 bg-[var(--color-cyan-soft)]/10"
                        : "border border-transparent hover:bg-[var(--color-bg-oled)]/40",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                        impact >= 0.75
                          ? "border-[var(--color-red)]/40 bg-[var(--color-red-soft)]/40 text-[var(--color-red)]"
                          : impact >= 0.45
                            ? "border-[var(--color-ember)]/40 bg-[var(--color-ember-soft)]/40 text-[var(--color-ember)]"
                            : "border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/50 text-[var(--color-text-muted)]",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
                          {ev.headline}
                        </p>
                      </div>
                      {ev.rationale && (
                        <p
                          className={cn(
                            "mt-0.5 line-clamp-2 text-[12.5px] leading-snug",
                            severityTone,
                          )}
                        >
                          {ev.rationale}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <SourceChip
                          source={ev.source as SourceKey}
                          publishedAt={ev.publishedAt}
                        />
                        <span className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/35 px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-text-muted)]">
                          impact
                          <span className={cn("tabular-nums", severityTone)}>
                            {impactPct}%
                          </span>
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-lg border px-2 py-0.5 font-mono text-[10px] uppercase",
                            impact >= 0.75
                              ? "border-[var(--color-red)]/35 text-[var(--color-red)]"
                              : impact >= 0.45
                                ? "border-[var(--color-ember)]/35 text-[var(--color-ember)]"
                                : "border-[var(--color-cyan)]/35 text-[var(--color-cyan)]",
                          )}
                        >
                          {impact >= 0.75 ? "critical" : impact >= 0.45 ? "high" : "moderate"}
                        </span>
                        {selectedEventId === ev.id && (
                          <span className="inline-flex items-center rounded-lg border border-[var(--color-cyan)]/40 px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-cyan)]">
                            Focused
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
