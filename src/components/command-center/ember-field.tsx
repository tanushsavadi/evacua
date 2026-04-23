"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Clock,
  Flame,
  MapPin,
  Route as RouteIcon,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { PlanDiff } from "@/lib/schemas/plan-diff";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The Ember Field is the re-plan diff drawer. It drops into the top of the
 * Plan panel when the Diff Narrator surfaces a material change. It's quiet
 * enough for "calm" diffs and glows when things get urgent — never alarmist,
 * always directive.
 */
export function EmberField({
  diff,
  onDismiss,
}: {
  diff: PlanDiff | null;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <AnimatePresence initial={false}>
      {diff && (
        <motion.div
          key={diff.id}
          initial={{ opacity: 0, y: -8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.99 }}
          transition={{ duration: 0.42, ease: EASE }}
          className="relative mx-5 mt-4 overflow-hidden rounded-xl border bg-[var(--color-bg-oled)]/70 backdrop-blur-sm"
          style={{
            borderColor:
              diff.severity === "urgent"
                ? "color-mix(in oklab, var(--color-ember) 55%, transparent)"
                : diff.severity === "notable"
                  ? "color-mix(in oklab, var(--color-amber) 40%, transparent)"
                  : "var(--color-line-strong)",
          }}
        >
          {/* Ambient accent */}
          <SeverityGlow severity={diff.severity} />

          <div className="relative flex items-start gap-3 px-4 pt-3.5 pb-3">
            <SeverityBadge severity={diff.severity} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-[14.5px] font-medium leading-snug tracking-[-0.005em] text-[var(--color-text-primary)]">
                  {diff.headline}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="-m-1 rounded-full p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
                    aria-label={expanded ? "Collapse" : "Expand"}
                  >
                    <motion.span
                      animate={{ rotate: expanded ? 90 : 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="inline-flex"
                    >
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                    </motion.span>
                  </button>
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="-m-1 rounded-full p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
                {diff.narrative}
              </p>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {expanded && <ChangeDetails diff={diff} />}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SeverityGlow({ severity }: { severity: PlanDiff["severity"] }) {
  const color =
    severity === "urgent"
      ? "var(--color-ember)"
      : severity === "notable"
        ? "var(--color-amber)"
        : "var(--color-cyan)";
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background: `radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, ${color} 18%, transparent) 0%, transparent 55%)`,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: severity === "urgent" ? 1 : 0.75 }}
      transition={{ duration: 0.6 }}
    />
  );
}

function SeverityBadge({ severity }: { severity: PlanDiff["severity"] }) {
  const Icon = severity === "urgent" ? Flame : Sparkles;
  const bg =
    severity === "urgent"
      ? "bg-[var(--color-ember-soft)] text-[var(--color-ember)]"
      : severity === "notable"
        ? "bg-[var(--color-amber-soft)] text-[var(--color-amber)]"
        : "bg-[color-mix(in_oklab,var(--color-cyan)_15%,transparent)] text-[var(--color-cyan)]";
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-white/5",
        bg,
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
    </div>
  );
}

function ChangeDetails({ diff }: { diff: PlanDiff }) {
  const rows: { icon: React.ElementType; label: string; body: React.ReactNode }[] = [];

  if (diff.stateChanged) {
    rows.push({
      icon: Sparkles,
      label: "Posture",
      body: (
        <span className="text-[var(--color-text-primary)]">
          <span className="text-[var(--color-text-muted)]">{diff.prevState}</span>
          <span className="mx-1.5 text-[var(--color-text-muted)]">→</span>
          <span>{diff.nextState}</span>
        </span>
      ),
    });
  }

  if (diff.primaryRouteChanged && diff.nextPrimary) {
    const prev = diff.prevPrimary?.via ?? diff.prevPrimary?.summary;
    const next = diff.nextPrimary.via ?? diff.nextPrimary.summary;
    rows.push({
      icon: RouteIcon,
      label: "Primary route",
      body: (
        <span className="text-[var(--color-text-primary)]">
          {prev && (
            <span className="text-[var(--color-text-muted)] line-through decoration-[var(--color-text-muted)]/50">
              {prev}
            </span>
          )}
          {prev && <span className="mx-1.5 text-[var(--color-text-muted)]">→</span>}
          <span>{next}</span>
          <span className="ml-2 font-mono text-[10.5px] text-[var(--color-text-muted)]">
            {Math.round(diff.nextPrimary.durationMin)} min ·{" "}
            {diff.nextPrimary.distanceKm.toFixed(1)} km
          </span>
        </span>
      ),
    });
  }

  if (diff.destinationChanged && diff.nextDestination) {
    rows.push({
      icon: MapPin,
      label: "Destination",
      body: (
        <span className="text-[var(--color-text-primary)]">
          {diff.prevDestination?.label && (
            <span className="text-[var(--color-text-muted)] line-through decoration-[var(--color-text-muted)]/50">
              {diff.prevDestination.label}
            </span>
          )}
          {diff.prevDestination?.label && (
            <span className="mx-1.5 text-[var(--color-text-muted)]">→</span>
          )}
          <span>{diff.nextDestination.label}</span>
        </span>
      ),
    });
  }

  if (Math.abs(diff.leaveByDeltaMin) >= 5) {
    const earlier = diff.leaveByDeltaMin > 0;
    rows.push({
      icon: Clock,
      label: "Leave-by",
      body: (
        <span
          className={cn(
            "font-mono tabular-nums",
            earlier
              ? "text-[var(--color-ember)]"
              : "text-[var(--color-text-primary)]",
          )}
        >
          {earlier ? "−" : "+"}
          {Math.abs(diff.leaveByDeltaMin)} min
        </span>
      ),
    });
  }

  const addedHighs = diff.addedTasks.filter((t) => t.priority === "high");

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
      className="relative border-t border-[var(--color-line-subtle)]/70 bg-[var(--color-bg-oled)]/30"
    >
      <div className="space-y-2 px-4 py-3">
        {rows.length > 0 && (
          <dl className="space-y-1.5">
            {rows.map(({ icon: Icon, label, body }) => (
              <div key={label} className="flex items-start gap-2.5 text-[12px]">
                <Icon
                  className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-text-muted)]"
                  strokeWidth={1.75}
                />
                <dt className="w-[84px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                  {label}
                </dt>
                <dd className="min-w-0 flex-1 leading-snug">{body}</dd>
              </div>
            ))}
          </dl>
        )}

        {addedHighs.length > 0 && (
          <div className="pt-1.5">
            <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              New high-priority steps
            </div>
            <ul className="space-y-1">
              {addedHighs.slice(0, 3).map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 text-[12.5px] text-[var(--color-text-primary)]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-ember)]" />
                  {t.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {diff.triggers.length > 0 && (
          <div className="pt-2">
            <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
              Because of
            </div>
            <ul className="space-y-1">
              {diff.triggers.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 text-[12px] text-[var(--color-text-secondary)]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-amber)]/80" />
                  <span className="min-w-0 flex-1 truncate">{t.headline}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                    {t.source}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}
