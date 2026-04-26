"use client";

import Link from "next/link";
import {
  ChevronLeft,
  Clock3,
  Flag,
  Flame,
  Gauge,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  PanelTop,
  Truck,
} from "lucide-react";
import { OpsMetric, OpsShellHeader, OpsStatusPill } from "./ops-shell-header";
import type { CrisisState } from "./state-badge";
import { StateBadge } from "./state-badge";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { IncidentOpsLog, IncidentOpsState } from "./incident-ops-panel";

export function CommandTopBar({
  state,
  mode = "live",
  focusedEvent,
  focusedOpsState,
  pinnedCount = 0,
  latestOps,
  compactMode = false,
  showLeftRail = true,
  showRightRail = true,
  onToggleCompactMode,
  onToggleLeftRail,
  onToggleRightRail,
  onOpenIncidentOps,
  signalsComputedAt,
  signalsStale,
  activeIncidentCount = 0,
  responderTotals,
}: {
  state: CrisisState;
  mode?: "live";
  focusedEvent?: CrisisEvent | null;
  focusedOpsState?: IncidentOpsState | null;
  pinnedCount?: number;
  latestOps?: IncidentOpsLog | null;
  compactMode?: boolean;
  showLeftRail?: boolean;
  showRightRail?: boolean;
  onToggleCompactMode?: () => void;
  onToggleLeftRail?: () => void;
  onToggleRightRail?: () => void;
  onOpenIncidentOps?: () => void;
  signalsComputedAt?: string | null;
  signalsStale?: boolean;
  activeIncidentCount?: number;
  responderTotals?: {
    available: number;
    dispatched: number;
    active: number;
    total: number;
  } | null;
}) {
  const feedLabel = signalsStale ? "Stale" : signalsComputedAt ? "Fresh" : mode;
  const opsStatus = focusedOpsState?.status ?? "active";
  const subtitle =
    focusedEvent?.headline ??
    (latestOps
      ? `${latestOps.action} at ${new Date(latestOps.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "California wildfire operations");

  return (
    <OpsShellHeader
      subtitle={subtitle}
      metrics={
        <>
          <OpsMetric icon={Flame} label="Incidents" value={activeIncidentCount} tone="ember" />
          <OpsMetric icon={Flag} label="Pinned" value={pinnedCount} tone="muted" />
          <OpsMetric
            icon={Truck}
            label="Teams"
            value={`${responderTotals?.available ?? 0}/${responderTotals?.total ?? 0}`}
            tone="cyan"
          />
          <OpsMetric
            icon={signalsStale ? Clock3 : Gauge}
            label="Feed"
            value={feedLabel}
            tone={signalsStale ? "ember" : "muted"}
          />
        </>
      }
      actions={
        <>
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-white/[0.14] hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            Dashboard
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            <HeaderIconButton
              onClick={onToggleLeftRail}
              label={showLeftRail ? "Hide left rail" : "Show left rail"}
            >
              {showLeftRail ? (
                <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} />
              )}
            </HeaderIconButton>
            <HeaderIconButton
              onClick={onToggleRightRail}
              label={showRightRail ? "Hide right rail" : "Show right rail"}
            >
              {showRightRail ? (
                <PanelRightClose className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <PanelRightOpen className="h-4 w-4" strokeWidth={1.75} />
              )}
            </HeaderIconButton>
            {onToggleCompactMode && (
              <HeaderIconButton
                onClick={onToggleCompactMode}
                label={compactMode ? "Disable compact mode" : "Enable compact mode"}
              >
                {compactMode ? (
                  <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
                ) : (
                  <Minimize2 className="h-4 w-4" strokeWidth={1.75} />
                )}
              </HeaderIconButton>
            )}
            <HeaderIconButton
              onClick={onOpenIncidentOps}
              label="Open incident operations"
            >
              <PanelTop className="h-4 w-4" strokeWidth={1.75} />
            </HeaderIconButton>
          </div>

          <OpsStatusPill
            active={mode === "live" && !signalsStale}
            label={signalsStale ? "Feed stale" : "Feed active"}
          />
          <span className="hidden md:inline-flex">
            <StateBadge state={state} size="sm" />
          </span>
          <span className="hidden rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 font-mono text-[10px] uppercase text-[var(--color-text-muted)] 2xl:inline-flex">
            {opsStatus}
          </span>
        </>
      }
    />
  );
}

function HeaderIconButton({
  onClick,
  label,
  children,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-secondary)] transition-colors hover:border-white/[0.14] hover:text-white"
      aria-label={label}
    >
      {children}
    </button>
  );
}
