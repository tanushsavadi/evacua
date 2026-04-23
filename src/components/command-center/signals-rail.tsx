"use client";

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
}: {
  events: CrisisEvent[];
  mode: "live" | "scenario";
  isFetching: boolean;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)]/70 px-5 py-4">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          <Activity className="h-3 w-3" strokeWidth={1.75} />
          Signals
          {isFetching && (
            <span className="ml-1 inline-block h-1 w-1 animate-pulse rounded-full bg-[var(--color-cyan)]" />
          )}
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          {mode === "live" ? "live" : "scripted"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="max-w-[32ch] text-[13.5px] leading-relaxed text-[var(--color-text-muted)]">
            No active signals within the scoring radius. Evacua will notify
            you the moment that changes.
          </p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-[var(--color-line-subtle)]/60 overflow-y-auto">
          <AnimatePresence initial={false}>
            {events.map((ev) => {
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
                  className="group px-5 py-4"
                >
                  <div className="flex items-start gap-3">
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
                        <p className="truncate text-[13px] font-medium tracking-[-0.005em] text-[var(--color-text-primary)]">
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
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                          impact
                          <span className={cn("tabular-nums", severityTone)}>
                            {impactPct}%
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
