"use client";

import { Users, Home as HomeIcon, Car, PawPrint, Pill, Phone, Navigation } from "lucide-react";
import type { Household } from "@/lib/schemas/household";
import { cn } from "@/lib/utils";

type Row = { icon: React.ElementType; label: string; value: React.ReactNode };

export function HouseholdPanel({
  household,
  signalsSummary,
}: {
  household: Household | null;
  signalsSummary?: { active: number; lastUpdated?: string };
}) {
  if (!household) {
    return (
      <aside className="flex h-full flex-col rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 p-5 backdrop-blur-sm">
        <SectionHeader label="Household" />
        <div className="mt-auto rounded-xl border border-dashed border-[var(--color-line-subtle)] p-5 text-center text-[13px] text-[var(--color-text-muted)]">
          No household yet. Complete setup to anchor the plan to your home.
        </div>
      </aside>
    );
  }

  const rows: Row[] = [
    {
      icon: HomeIcon,
      label: "Home",
      value: (
        <span className="line-clamp-2 text-[13.5px] text-[var(--color-text-primary)]">
          {household.address}
        </span>
      ),
    },
    {
      icon: Users,
      label: `${household.members.length} member${
        household.members.length === 1 ? "" : "s"
      }`,
      value: household.members
        .slice(0, 4)
        .map((m) => m.name)
        .join(" · "),
    },
    {
      icon: Car,
      label: `${household.vehicles.length} vehicle${
        household.vehicles.length === 1 ? "" : "s"
      }`,
      value: household.vehicles
        .map((v) => `${v.label} (${v.seats})`)
        .join(" · "),
    },
  ];

  if (household.pets.length) {
    rows.push({
      icon: PawPrint,
      label: `${household.pets.length} pet${household.pets.length === 1 ? "" : "s"}`,
      value: household.pets.map((p) => p.name).join(" · "),
    });
  }
  if (household.medications.length) {
    rows.push({
      icon: Pill,
      label: `${household.medications.length} medication${
        household.medications.length === 1 ? "" : "s"
      }`,
      value: (
        <span>
          {household.medications
            .map((m) => m.name + (m.critical ? " ·" : ""))
            .join(" · ")}
        </span>
      ),
    });
  }
  if (household.destinations.length) {
    rows.push({
      icon: Navigation,
      label: "Destinations",
      value: household.destinations
        .map((d) => d.label || d.address)
        .join(" · "),
    });
  }
  if (household.contacts.length) {
    rows.push({
      icon: Phone,
      label: "Contacts",
      value: household.contacts
        .map((c) => `${c.name} (${c.relation})`)
        .join(" · "),
    });
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 backdrop-blur-sm">
      <div className="border-b border-[var(--color-line-subtle)]/70 px-5 py-4">
        <SectionHeader label="Household" />
      </div>

      <ul className="flex-1 divide-y divide-[var(--color-line-subtle)]/60 overflow-y-auto">
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <li key={i} className="group px-5 py-4">
              <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                <Icon className="h-3 w-3" strokeWidth={1.75} />
                {r.label}
              </div>
              <div className="mt-1.5 text-[13.5px] leading-snug text-[var(--color-text-secondary)]">
                {r.value}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-[var(--color-line-subtle)]/70 px-5 py-3.5">
        <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
          <span>Active signals</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              (signalsSummary?.active ?? 0) > 0
                ? "text-[var(--color-ember)]"
                : "text-[var(--color-text-secondary)]",
            )}
          >
            {signalsSummary?.active ?? 0}
          </span>
        </div>
      </div>
    </aside>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
        {label}
      </span>
    </div>
  );
}
