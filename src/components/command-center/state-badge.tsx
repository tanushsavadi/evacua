"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type CrisisState = "watch" | "prepare" | "leave";

const STYLES: Record<
  CrisisState,
  { label: string; bg: string; text: string; dot: string; tag: string }
> = {
  watch: {
    label: "Watch",
    bg: "bg-[var(--color-cyan-soft)]/50",
    text: "text-[var(--color-cyan)]",
    dot: "bg-[var(--color-cyan)]",
    tag: "border-[var(--color-cyan)]/40",
  },
  prepare: {
    label: "Prepare",
    bg: "bg-[var(--color-amber-soft)]/40",
    text: "text-[var(--color-amber)]",
    dot: "bg-[var(--color-amber)]",
    tag: "border-[var(--color-amber)]/40",
  },
  leave: {
    label: "Leave now",
    bg: "bg-[var(--color-red-soft)]/60",
    text: "text-[var(--color-red)]",
    dot: "bg-[var(--color-red)]",
    tag: "border-[var(--color-red)]/50",
  },
};

export function StateBadge({
  state,
  className,
  size = "md",
}: {
  state: CrisisState;
  className?: string;
  size?: "sm" | "md";
}) {
  const s = STYLES[state];
  return (
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        s.bg,
        s.text,
        s.tag,
        size === "sm"
          ? "px-2 py-0.5 text-[10.5px] uppercase tracking-[0.16em]"
          : "px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]",
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {state !== "watch" && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              s.dot,
            )}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", s.dot)} />
      </span>
      {s.label}
    </motion.span>
  );
}
