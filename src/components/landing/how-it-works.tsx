"use client";

import { motion } from "framer-motion";
import { Home, Activity, Route } from "lucide-react";

const steps = [
  {
    num: "01",
    title: "Tell Evacua about your household",
    body: "Address, people, pets, meds, mobility, vehicles, destinations. Calm setup, takes two minutes.",
    icon: Home,
  },
  {
    num: "02",
    title: "We watch the signals for you",
    body: "NWS alerts, fire perimeters, road closures, weather. Scored against your home, quietly, in the background.",
    icon: Activity,
  },
  {
    num: "03",
    title: "You get a plan that keeps up",
    body: "Leave-by time, route, destination, tasks by person. It regenerates when conditions change — and tells you why.",
    icon: Route,
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-28 pt-20 md:pt-28"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mx-auto mb-14 max-w-xl text-center"
      >
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          How it works
        </p>
        <h2 className="font-display text-3xl font-medium leading-tight tracking-[-0.02em] text-[var(--color-text-primary)] md:text-[40px]">
          Three moves. One household, always ready.
        </h2>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-3 md:gap-6">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.article
              key={s.num}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.6, ease: EASE, delay: i * 0.08 }}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 p-7 backdrop-blur-sm transition-colors hover:border-[var(--color-line-strong)]"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-line-strong)] to-transparent opacity-60"
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                  {s.num}
                </span>
                <Icon
                  className="h-[18px] w-[18px] text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-ember)]"
                  strokeWidth={1.5}
                />
              </div>
              <h3 className="mt-6 font-display text-[19px] font-medium leading-snug tracking-[-0.01em] text-[var(--color-text-primary)]">
                {s.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
                {s.body}
              </p>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
