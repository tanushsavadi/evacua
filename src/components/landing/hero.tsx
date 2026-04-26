"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  return (
    <section className="relative z-10 flex min-h-[78vh] flex-col items-center justify-center px-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mb-8 inline-flex items-center gap-2 rounded-lg border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/60 px-3 py-1.5 backdrop-blur-sm"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-ember)] opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-ember)]" />
        </span>
        <span className="text-[11px] font-medium uppercase text-[var(--color-text-secondary)]">
          Wildfire Command Center - California
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.05 }}
        className="max-w-[18ch] text-balance font-display text-[clamp(2.6rem,6.4vw,4.6rem)] font-medium leading-[1.02] text-[var(--color-text-primary)]"
      >
        Unified operations layer for{" "}
        <span className="relative inline-block">
          incidents
          <span
            aria-hidden
            className="absolute left-0 right-0 top-[100%] mt-[0.08em] h-[2px] bg-gradient-to-r from-transparent via-[var(--color-ember)] to-transparent"
          />
        </span>{" "}
        and{" "}
        <span className="relative inline-block text-[var(--color-ember)]">
          response
        </span>
        .
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}
        className="mx-auto mt-7 max-w-[46ch] text-balance text-[17px] leading-[1.55] text-[var(--color-text-secondary)] md:text-[18px]"
      >
        Evacua is an AI-assisted wildfire operations dashboard. It fuses live
        fire, weather, road, and environmental signals into responder-ready
        actions, reroutes, dispatch decisions, and alert workflows.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE, delay: 0.22 }}
        className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:gap-4"
      >
        <Link href="/plan">
          <Button size="lg" variant="ember" className="min-w-[220px]">
            Open command center
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </Button>
        </Link>
        <Link href="/plan">
          <Button size="lg" variant="ghost" className="min-w-[220px]">
            <Radio className="h-[18px] w-[18px]" strokeWidth={1.75} />
            View responder ops
          </Button>
        </Link>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: EASE, delay: 0.5 }}
        className="mt-10 font-mono text-[11px] uppercase text-[var(--color-text-muted)]"
      >
        Live operations - responder dispatch - open source
      </motion.p>
    </section>
  );
}
