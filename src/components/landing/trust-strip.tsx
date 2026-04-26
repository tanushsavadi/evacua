"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

const sources = [
  { name: "NWS", full: "National Weather Service" },
  { name: "NIFC", full: "National Interagency Fire Center" },
  { name: "CAL FIRE", full: "California Department of Forestry & Fire Protection" },
  { name: "Caltrans", full: "California Department of Transportation" },
  { name: "OSM", full: "OpenStreetMap" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function TrustStrip() {
  return (
    <section
      id="sources"
      className="relative z-10 mx-auto w-full max-w-5xl px-6 pt-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-10%" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="flex flex-col items-center gap-4"
      >
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase text-[var(--color-text-muted)]">
          <ShieldCheck
            className="h-3.5 w-3.5 text-[var(--color-cyan)]"
            strokeWidth={1.75}
          />
          Signals sourced from
        </div>

        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {sources.map((s) => (
            <li
              key={s.name}
              className="group relative font-display text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
              title={s.full}
            >
              {s.name}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-1 h-px bg-gradient-to-r from-transparent via-[var(--color-line-strong)] to-transparent opacity-0 transition-opacity group-hover:opacity-100"
              />
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
