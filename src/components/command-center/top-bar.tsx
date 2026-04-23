"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { Wordmark } from "@/components/landing/wordmark";
import type { CrisisState } from "./state-badge";
import { StateBadge } from "./state-badge";

export function CommandTopBar({
  state,
  mode = "live",
}: {
  state: CrisisState;
  mode?: "live" | "scenario";
}) {
  return (
    <header className="relative z-20 flex items-center justify-between border-b border-[var(--color-line-subtle)]/70 bg-[var(--color-bg-oled)]/80 px-5 py-3 backdrop-blur-md md:px-7">
      <div className="flex items-center gap-5">
        <Link href="/" className="inline-flex">
          <Wordmark />
        </Link>
        <span aria-hidden className="h-4 w-px bg-[var(--color-line-subtle)]" />
        <div className="hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)] md:flex">
          <Radio
            className="h-3 w-3 text-[var(--color-cyan)]"
            strokeWidth={1.75}
          />
          Command center
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="hidden items-center gap-2 rounded-full border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/60 px-2.5 py-1 text-[10.5px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)] md:inline-flex">
          <span
            className={
              "h-1.5 w-1.5 rounded-full " +
              (mode === "live"
                ? "bg-[var(--color-cyan)]"
                : "bg-[var(--color-amber)]")
            }
          />
          {mode === "live" ? "Live signals" : "Scripted scenario"}
        </span>
        <StateBadge state={state} size="sm" />
      </div>
    </header>
  );
}
