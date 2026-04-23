"use client";

import { cn, formatRelativeTime } from "@/lib/utils";

export type SourceKey =
  | "nws"
  | "nifc"
  | "calfire"
  | "caltrans"
  | "osm"
  | "scenario";

const LABELS: Record<SourceKey, string> = {
  nws: "NWS",
  nifc: "NIFC",
  calfire: "CAL FIRE",
  caltrans: "Caltrans",
  osm: "OSM",
  scenario: "Scenario",
};

export function SourceChip({
  source,
  publishedAt,
  confidence,
  className,
}: {
  source: SourceKey;
  publishedAt?: string | Date;
  confidence?: number;
  className?: string;
}) {
  const pct =
    typeof confidence === "number"
      ? Math.max(0, Math.min(100, Math.round(confidence * 100)))
      : undefined;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/70 px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]",
        className,
      )}
    >
      <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-cyan)]" />
      <span>{LABELS[source]}</span>
      {publishedAt && (
        <>
          <span className="text-[var(--color-text-muted)]">·</span>
          <span className="text-[var(--color-text-muted)]">
            {formatRelativeTime(publishedAt)}
          </span>
        </>
      )}
      {pct !== undefined && (
        <>
          <span className="text-[var(--color-text-muted)]">·</span>
          <span className="text-[var(--color-text-primary)]">{pct}%</span>
        </>
      )}
    </span>
  );
}
