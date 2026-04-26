"use client";

import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OpsMetricTone = "ember" | "cyan" | "red" | "muted";

export function OpsShellHeader({
  title = "Evacua",
  subtitle,
  badge = "Live ops",
  metrics,
  actions,
  className,
}: {
  title?: string;
  subtitle: string;
  badge?: string;
  metrics: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative z-20 border-b border-white/[0.07] bg-black/55 px-3 py-3 shadow-[0_24px_80px_-60px_rgba(0,0,0,1)] backdrop-blur-xl md:px-5",
        className,
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="evacua-sheen relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--color-ember)]/25 bg-[var(--color-ember-soft)]/35 shadow-[0_0_36px_-18px_var(--color-ember)]">
            <Flame className="h-5 w-5 text-[var(--color-ember)]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-white">{title}</h1>
              {badge && (
                <Badge
                  variant="secondary"
                  className="hidden border-[var(--color-cyan)]/20 text-[var(--color-cyan)] sm:inline-flex"
                >
                  {badge}
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-[var(--color-text-muted)]">
              {subtitle}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:min-w-[660px]">
          {metrics}
        </div>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function OpsMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  tone: OpsMetricTone;
}) {
  const toneClass =
    tone === "ember"
      ? "text-[var(--color-ember)]"
      : tone === "cyan"
        ? "text-[var(--color-cyan)]"
        : tone === "red"
          ? "text-[var(--color-red)]"
          : "text-[var(--color-text-primary)]";
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
        <Icon className="h-3 w-3" strokeWidth={1.75} />
        {label}
      </div>
      <p className={cn("mt-1 truncate font-mono text-sm tabular-nums", toneClass)}>
        {value}
      </p>
    </div>
  );
}

export function OpsStatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-medium text-[var(--color-text-secondary)]">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "animate-pulse bg-[var(--color-cyan)]" : "bg-[var(--color-text-muted)]",
        )}
      />
      {label}
    </span>
  );
}
