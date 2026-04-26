"use client";

import {
  Bot,
  Map,
  Route,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type {
  AgentOpsResponse,
  RouteOpsResponse,
} from "@/lib/hooks/use-fire-ops";
import { cn } from "@/lib/utils";

export function AgentOpsPanel({
  agentOps,
  routeOps,
  loading,
}: {
  agentOps: AgentOpsResponse | null;
  routeOps: RouteOpsResponse | null;
  loading?: boolean;
}) {
  const routes = routeOps?.routes ?? [];
  const evacuations = routeOps?.evacuations ?? [];
  const topFindings = agentOps?.findings.slice(0, 3) ?? [];

  return (
    <section className="evacua-panel overflow-hidden rounded-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
          <Bot className="h-3 w-3" strokeWidth={1.75} />
          Autonomous agent
          {loading && (
            <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--color-cyan)]" />
          )}
        </div>
        <span className="font-mono text-[10px] uppercase text-[var(--color-text-muted)]">
          {agentOps?.scannedAt
            ? new Date(agentOps.scannedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "standby"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3 py-2">
        <Stat icon={Sparkles} label="Findings" value={agentOps?.findings.length ?? 0} />
        <Stat icon={Route} label="Routes" value={routes.length} />
        <Stat icon={Map} label="Zones" value={evacuations.length} />
      </div>

      <div className="space-y-1.5 px-3 pb-3">
        {topFindings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
            No agent route changes in the current scan window.
          </div>
        ) : (
          topFindings.map((finding) => (
            <div
              key={finding.id}
              className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  {finding.type === "evacuation_zone" ? (
                    <ShieldAlert className="h-3.5 w-3.5 text-[var(--color-ember)]" strokeWidth={1.75} />
                  ) : (
                    <TriangleAlert className="h-3.5 w-3.5 text-[var(--color-amber)]" strokeWidth={1.75} />
                  )}
                  <p className="truncate text-[12px] text-[var(--color-text-primary)]">
                    {finding.fireName}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] uppercase",
                    finding.severity === "critical"
                      ? "border-[var(--color-red)]/40 text-[var(--color-red)]"
                      : "border-[var(--color-ember)]/40 text-[var(--color-ember)]",
                  )}
                >
                  {finding.severity}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--color-text-secondary)]">
                {finding.reason}
              </p>
            </div>
          ))
        )}

        {routes[0] && (
          <div className="rounded-lg border border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/10 px-3 py-2">
            <p className="font-mono text-[9.5px] uppercase text-[var(--color-cyan)]">
              Latest route advisory
            </p>
            <p className="mt-1 line-clamp-2 text-[11.5px] text-[var(--color-text-secondary)]">
              {routes[0].reason}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9.5px] uppercase text-[var(--color-text-muted)]">
        <Icon className="h-2.5 w-2.5" strokeWidth={1.75} />
        {label}
      </div>
      <p className="mt-0.5 font-mono text-[14px] text-[var(--color-text-primary)]">
        {value}
      </p>
    </div>
  );
}
