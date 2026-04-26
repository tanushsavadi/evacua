"use client";

import { ExternalLink, Shield } from "lucide-react";

const LINKS: { label: string; href: string; hint: string }[] = [
  {
    label: "CAL FIRE incidents",
    href: "https://incidents.fire.ca.gov/",
    hint: "Active fires & containment",
  },
  {
    label: "QuickMap",
    href: "https://quickmap.dot.ca.gov/",
    hint: "Road closures - Caltrans",
  },
  {
    label: "Listos California",
    href: "https://www.listoscalifornia.org/",
    hint: "Preparedness · español",
  },
  {
    label: "Cal OES",
    href: "https://www.caloes.ca.gov/",
    hint: "State emergency office",
  },
];

/**
 * Grounds the product for residents: Evacua is decision support + rehearsal,
 * not a replacement for Wireless Emergency Alerts or county evacuation orders.
 */
export function CaliforniaOfficialStrip() {
  return (
    <div className="space-y-2.5 px-5 py-3">
      <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
        <Shield className="h-3 w-3" strokeWidth={1.75} />
        Verify with official California sources
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-cyan)]/35 hover:text-[var(--color-text-primary)]"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {l.label}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-[var(--color-text-muted)]">
                  {l.hint}
                </span>
              </span>
              <ExternalLink
                className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-90"
                strokeWidth={1.75}
              />
            </a>
          </li>
        ))}
      </ul>
      <p className="text-[10.5px] leading-relaxed text-[var(--color-text-muted)]">
        Evacua summarizes public feeds for responder operations. Always follow county
        evacuation orders, ALERT / Wireless Emergency Alerts, and on-scene
        instructions.
      </p>
    </div>
  );
}
