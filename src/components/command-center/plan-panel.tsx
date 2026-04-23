"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Sparkles,
  MapPin,
  Route as RouteIcon,
  ListChecks,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StateBadge } from "./state-badge";
import { LeaveByChip } from "./leave-by-chip";
import { SourceChip, type SourceKey } from "./source-chip";
import { EmberField } from "./ember-field";
import type { Plan, PlanTask } from "@/lib/schemas/plan";
import type { PlanDiff } from "@/lib/schemas/plan-diff";
import type { Household } from "@/lib/schemas/household";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export function PlanPanel({
  household,
  plan,
  loading,
  onSelectRoute,
  selectedRouteId,
  diff,
  onDismissDiff,
}: {
  household: Household | null;
  plan: Plan | null;
  loading: boolean;
  onSelectRoute?: (routeId: string) => void;
  selectedRouteId?: string;
  diff?: PlanDiff | null;
  onDismissDiff?: () => void;
}) {
  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-[var(--color-line-subtle)]/70 px-5 py-4">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          Current plan
          {plan && (
            <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
              v{plan.version}
            </span>
          )}
          {loading && (
            <Loader2
              className="h-3 w-3 animate-spin text-[var(--color-cyan)]"
              strokeWidth={1.75}
            />
          )}
        </div>
        {plan ? (
          <StateBadge state={plan.state} size="sm" />
        ) : (
          <StateBadge state="watch" size="sm" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <EmberField diff={diff ?? null} onDismiss={() => onDismissDiff?.()} />
        {!household ? (
          <EmptyState />
        ) : !plan ? (
          <StandbyState loading={loading} />
        ) : (
          <PlanBody
            plan={plan}
            onSelectRoute={onSelectRoute}
            selectedRouteId={selectedRouteId}
          />
        )}
      </div>

      <div className="border-t border-[var(--color-line-subtle)]/70 px-5 py-3 text-[11px] text-[var(--color-text-muted)]">
        {plan?.author === "opus" ? (
          <span>
            Reasoned by Claude Opus 4.7 · grounded in{" "}
            {plan.citations.length || 0} sources
          </span>
        ) : (
          <span>Deterministic plan · upstream signals grounded</span>
        )}
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]">
        <Sparkles
          className="h-4 w-4 text-[var(--color-ember)]"
          strokeWidth={1.75}
        />
      </div>
      <p className="max-w-[28ch] text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
        Add your household to unlock a plan anchored to your home.
      </p>
      <Link href="/setup" className="mt-4">
        <Button size="sm" variant="ember">
          Start setup
        </Button>
      </Link>
    </div>
  );
}

function StandbyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="mb-3 h-1 w-16 overflow-hidden rounded-full bg-[var(--color-line-subtle)]">
        {loading && (
          <div className="h-full w-1/2 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-[var(--color-cyan)]" />
        )}
      </div>
      <p className="text-[13px] text-[var(--color-text-muted)]">
        {loading ? "Composing your plan…" : "Waiting for signals"}
      </p>
      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }
      `}</style>
    </div>
  );
}

function PlanBody({
  plan,
  onSelectRoute,
  selectedRouteId,
}: {
  plan: Plan;
  onSelectRoute?: (routeId: string) => void;
  selectedRouteId?: string;
}) {
  const primary = plan.routes.find((r) => r.id === plan.primaryRouteId);
  const backup = plan.routes.find((r) => r.id === plan.backupRouteId);

  const tasksByPriority = (() => {
    const byP: Record<string, PlanTask[]> = { high: [], medium: [], low: [] };
    for (const t of plan.tasks) byP[t.priority].push(t);
    return byP;
  })();

  return (
    <motion.div
      key={plan.id + "-v" + plan.version}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="space-y-5 p-5"
    >
      <div>
        <p className="font-display text-[20px] font-medium leading-snug tracking-[-0.01em] text-[var(--color-text-primary)]">
          {plan.headline}
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-text-secondary)]">
          {plan.reasoning}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {plan.citations.map((c) => (
            <SourceChip key={c} source={c as SourceKey} />
          ))}
        </div>
      </div>

      {plan.leaveByIso && (
        <LeaveByChip
          state={plan.state}
          targetIso={plan.leaveByIso}
          className="w-full justify-between"
        />
      )}

      <SectionCard icon={MapPin} label="Destination">
        <div className="text-[14px] text-[var(--color-text-primary)]">
          {plan.destination.label}
        </div>
        <div className="mt-0.5 text-[12.5px] text-[var(--color-text-muted)]">
          {plan.destination.address}
        </div>
      </SectionCard>

      <SectionCard icon={RouteIcon} label="Route">
        <div className="space-y-2">
          {primary && (
            <RouteRow
              route={primary}
              selected={selectedRouteId === primary.id}
              kind="primary"
              onClick={() => onSelectRoute?.(primary.id)}
            />
          )}
          {backup && (
            <RouteRow
              route={backup}
              selected={selectedRouteId === backup.id}
              kind="backup"
              onClick={() => onSelectRoute?.(backup.id)}
            />
          )}
        </div>
      </SectionCard>

      <SectionCard icon={ListChecks} label="Tasks">
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {(["high", "medium", "low"] as const).flatMap((p) =>
              tasksByPriority[p].map((t, idx) => (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3, delay: idx * 0.03, ease: EASE }}
                  className="flex items-start gap-3"
                >
                  <PriorityDot priority={t.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug text-[var(--color-text-primary)]">
                      {t.text}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                        {t.assignedTo}
                      </span>
                      {t.reason && (
                        <span className="truncate text-[11.5px] text-[var(--color-text-muted)]">
                          {t.reason}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.li>
              )),
            )}
          </AnimatePresence>
        </ul>
      </SectionCard>
    </motion.div>
  );
}

function SectionCard({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/40 p-4">
      <div className="mb-2 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
        <Icon className="h-3 w-3" strokeWidth={1.75} />
        {label}
      </div>
      {children}
    </section>
  );
}

function RouteRow({
  route,
  selected,
  kind,
  onClick,
}: {
  route: import("@/lib/schemas/plan").RouteGeometry;
  selected: boolean;
  kind: "primary" | "backup";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-[var(--color-ember)]/50 bg-[var(--color-ember-soft)]/30"
          : "border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/50 hover:border-[var(--color-line-strong)]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          {kind === "primary" ? "Primary" : "Backup"}
        </div>
        <div className="mt-0.5 truncate text-[13px] text-[var(--color-text-primary)]">
          {route.via || route.summary}
        </div>
      </div>
      <div className="text-right text-[11.5px] leading-tight text-[var(--color-text-secondary)]">
        <div className="font-mono tabular-nums text-[var(--color-text-primary)]">
          {Math.round(route.durationMin)} min
        </div>
        <div className="text-[var(--color-text-muted)]">
          {route.distanceKm.toFixed(1)} km
        </div>
      </div>
    </button>
  );
}

function PriorityDot({ priority }: { priority: "high" | "medium" | "low" }) {
  const cls =
    priority === "high"
      ? "bg-[var(--color-ember)]"
      : priority === "medium"
        ? "bg-[var(--color-amber)]"
        : "bg-[var(--color-text-muted)]";
  return (
    <span className="relative mt-1.5 flex h-2 w-2 shrink-0">
      {priority === "high" && (
        <span
          className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-40", cls)}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", cls)} />
    </span>
  );
}
