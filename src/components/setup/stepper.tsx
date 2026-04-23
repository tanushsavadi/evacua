"use client";

import { cn } from "@/lib/utils";

export function Stepper({
  current,
  steps,
}: {
  current: number;
  steps: { id: string; label: string }[];
}) {
  return (
    <ol className="flex w-full items-center justify-center gap-2.5">
      {steps.map((s, i) => {
        const state =
          i < current ? "done" : i === current ? "current" : "pending";
        return (
          <li key={s.id} className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium transition-colors duration-300",
                state === "done" &&
                  "border-[var(--color-cyan)] bg-[var(--color-cyan)]/15 text-[var(--color-cyan)]",
                state === "current" &&
                  "border-[var(--color-ember)] bg-[var(--color-ember)]/15 text-[var(--color-ember)]",
                state === "pending" &&
                  "border-[var(--color-line-subtle)] text-[var(--color-text-muted)]",
              )}
            >
              {state === "done" ? (
                <CheckIcon />
              ) : (
                <span className="font-mono">{i + 1}</span>
              )}
            </div>
            <span
              className={cn(
                "hidden text-[12px] font-medium tracking-[-0.005em] md:inline",
                state === "pending"
                  ? "text-[var(--color-text-muted)]"
                  : "text-[var(--color-text-secondary)]",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "h-px w-6 md:w-10 transition-colors duration-300",
                  state === "done"
                    ? "bg-[var(--color-cyan)]/60"
                    : "bg-[var(--color-line-subtle)]",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3.5,8.5 6.5,11.5 12.5,5" />
    </svg>
  );
}
