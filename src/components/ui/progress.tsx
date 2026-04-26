import * as React from "react";
import { cn } from "@/lib/utils";

type ProgressProps = React.ComponentProps<"div"> & {
  value?: number | null;
  max?: number;
  indicatorClassName?: string;
};

function Progress({
  className,
  value = 0,
  max = 100,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value ?? 0)
    ? Math.min(Math.max(value ?? 0, 0), safeMax)
    : 0;
  const pct = (safeValue / safeMax) * 100;

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]",
        className,
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          "h-full rounded-full bg-[var(--color-cyan)] transition-[width] duration-700 ease-[var(--ease-premium)]",
          indicatorClassName,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
