"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

const scenarios = [
  {
    id: "coastal-palisades",
    badge: "Coastal · Santa Monica Mtns",
    title: "Warning upgrades to order",
    body: "Primary route closes mid-plan. Route re-draws and tasks re-order while you watch.",
  },
  {
    id: "sonoma-psps",
    badge: "North Bay · Sonoma",
    title: "Red flag + power shutoff",
    body: "Prep state with escalating risk. Medications and devices move to the top of the list.",
  },
  {
    id: "inland-empire-prepare",
    badge: "Inland Empire",
    title: "Slow burn, watchful calm",
    body: "Perimeter stays distant. Evacua stays in watch mode and explains why.",
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function ScenarioPicker() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mb-8 flex items-end justify-between gap-6"
      >
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
            Live re-plan demo
          </p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.015em] text-[var(--color-text-primary)] md:text-[30px]">
            Play a scripted wildfire scenario.
          </h2>
        </div>
        <p className="hidden max-w-xs text-[13px] leading-relaxed text-[var(--color-text-secondary)] md:block">
          Real adapters run alongside scripted events so the signature
          moment — a plan that re-plans itself — is always demonstrable.
        </p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-3">
        {scenarios.map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.6, ease: EASE, delay: i * 0.07 }}
          >
            <Link
              href={`/plan?demo=${s.id}`}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/60 p-6 backdrop-blur-sm transition-[border-color,transform] duration-300 ease-[var(--ease-premium)] hover:border-[var(--color-ember)]/50 hover:-translate-y-0.5"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                {s.badge}
              </span>
              <h3 className="mt-5 font-display text-[18px] font-medium leading-snug tracking-[-0.01em] text-[var(--color-text-primary)]">
                {s.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-text-secondary)]">
                {s.body}
              </p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-[var(--color-ember)]">
                Play scenario
                <ArrowUpRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
                  strokeWidth={2}
                />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
