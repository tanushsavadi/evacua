"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

export function StepShell({
  eyebrow,
  title,
  description,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="w-full"
    >
      <div className="mb-8 text-center">
        <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          {eyebrow}
        </p>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.02em] text-[var(--color-text-primary)] md:text-[34px]">
          {title}
        </h1>
        <p className="mx-auto mt-3 max-w-[44ch] text-[14.5px] leading-relaxed text-[var(--color-text-secondary)]">
          {description}
        </p>
      </div>
      <div className="rounded-3xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 p-6 backdrop-blur-sm md:p-8">
        {children}
      </div>
      {actions && (
        <div className="mt-6 flex items-center justify-between gap-3">
          {actions}
        </div>
      )}
    </motion.div>
  );
}
