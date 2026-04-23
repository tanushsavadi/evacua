"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn, formatCountdown } from "@/lib/utils";
import type { CrisisState } from "./state-badge";

/**
 * Persistent countdown anchor. The thin ring around the chip decays as
 * the leave-by time approaches — a gentle, non-alarming emotional cue.
 */
export function LeaveByChip({
  targetIso,
  state,
  className,
  compact = false,
}: {
  targetIso: string;
  state: CrisisState;
  className?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const target = new Date(targetIso).getTime();
  const totalWindowMs = 60 * 60 * 1000; // 60-min reference window
  const remaining = Math.max(0, target - now);
  const pct = Math.max(
    0,
    Math.min(1, remaining / totalWindowMs),
  );
  const strokeDasharray = 100;
  const strokeDashoffset = strokeDasharray * (1 - pct);

  const color =
    state === "leave"
      ? "var(--color-red)"
      : state === "prepare"
        ? "var(--color-ember)"
        : "var(--color-cyan)";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/80 px-3.5 py-2.5 backdrop-blur-sm",
        state === "leave" && "border-[var(--color-red)]/50 animate-ember-pulse",
        state === "prepare" && "border-[var(--color-ember)]/40",
        className,
      )}
    >
      <div className="relative h-9 w-9 shrink-0">
        <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke="var(--color-line-subtle)"
            strokeWidth="2"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9"
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.3s",
            }}
          />
        </svg>
        <Clock
          className="absolute inset-0 m-auto h-3.5 w-3.5"
          style={{ color }}
          strokeWidth={1.75}
        />
      </div>
      <div className="flex flex-col">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
          Leave by
        </span>
        <span
          className={cn(
            "font-mono tabular-nums tracking-tight text-[var(--color-text-primary)]",
            compact ? "text-[15px]" : "text-[18px]",
          )}
        >
          {formatCountdown(new Date(targetIso))}
        </span>
      </div>
    </div>
  );
}
