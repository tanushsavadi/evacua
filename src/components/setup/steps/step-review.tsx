"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, Info, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepShell } from "../step-shell";
import type { Household } from "@/lib/schemas/household";
import { computeReadiness } from "@/lib/schemas/household";

const EASE = [0.22, 1, 0.36, 1] as const;

export function StepReview({
  draft,
  onBack,
  onConfirm,
}: {
  draft: Partial<Household>;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { score, missing } = computeReadiness(draft);
  const pct = Math.round(score * 100);

  const members = draft.members ?? [];
  const vehicles = draft.vehicles ?? [];
  const pets = draft.pets ?? [];
  const meds = draft.medications ?? [];
  const dests = draft.destinations ?? [];
  const contacts = draft.contacts ?? [];

  return (
    <StepShell
      eyebrow="Step 5 of 5"
      title="Household ready."
      description="One last look, then Evacua starts watching the signals for you."
      actions={
        <>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button variant="ember" onClick={onConfirm}>
            Start monitoring my household
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Readiness meter */}
        <div className="rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/60 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              <ShieldCheck
                className="h-3.5 w-3.5 text-[var(--color-cyan)]"
                strokeWidth={1.75}
              />
              Readiness
            </div>
            <div className="font-mono text-[13px] tabular-nums text-[var(--color-text-primary)]">
              {pct}%
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-line-subtle)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: EASE }}
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-cyan)] to-[var(--color-ember)]"
            />
          </div>
          {missing.length > 0 && (
            <div className="mt-4 flex items-start gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
              <Info
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-amber)]"
                strokeWidth={1.75}
              />
              <p>
                Still missing:{" "}
                <span className="text-[var(--color-text-primary)]">
                  {missing.join(" · ")}
                </span>
                . You can add this later from the command center.
              </p>
            </div>
          )}
        </div>

        {/* Summary grid */}
        <div className="grid gap-3 md:grid-cols-2">
          <SummaryRow label="Home">
            {draft.address ? (
              <div className="flex items-start gap-2">
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-cyan)]"
                  strokeWidth={1.75}
                />
                <span>{draft.address}</span>
              </div>
            ) : (
              "—"
            )}
          </SummaryRow>
          <SummaryRow label="Dwelling">
            {draft.dwelling?.replace("_", " ") ?? "—"}
            {draft.floors ? ` · ${draft.floors} floor${draft.floors > 1 ? "s" : ""}` : ""}
          </SummaryRow>
          <SummaryRow label={`Members · ${members.length}`}>
            {members.length
              ? members.map((m) => `${m.name} (${m.role})`).join(", ")
              : "—"}
          </SummaryRow>
          <SummaryRow label={`Vehicles · ${vehicles.length}`}>
            {vehicles.length
              ? vehicles
                  .map((v) => `${v.label || "unnamed"} · ${v.seats} seats`)
                  .join(", ")
              : "—"}
          </SummaryRow>
          <SummaryRow label={`Pets · ${pets.length}`}>
            {pets.length
              ? pets.map((p) => `${p.name} (${p.species})`).join(", ")
              : "None"}
          </SummaryRow>
          <SummaryRow label={`Medications · ${meds.length}`}>
            {meds.length
              ? meds
                  .map((m) => `${m.name}${m.critical ? " · critical" : ""}`)
                  .join(", ")
              : "None"}
          </SummaryRow>
          <SummaryRow label={`Destinations · ${dests.length}`}>
            {dests.length
              ? dests.map((d) => `${d.label || "unnamed"} (${d.address})`).join(", ")
              : "None"}
          </SummaryRow>
          <SummaryRow label={`Contacts · ${contacts.length}`}>
            {contacts.length
              ? contacts
                  .map((c) => `${c.name} (${c.relation})`)
                  .join(", ")
              : "None"}
          </SummaryRow>
        </div>

        <p className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">
          Evacua stores this profile locally on your device. Nothing leaves
          your browser unless you share a family action card.{" "}
          <Link href="/" className="underline underline-offset-2">
            Learn more
          </Link>
          .
        </p>
      </div>
    </StepShell>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]/40 p-4">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-text-primary)]">
        {children}
      </div>
    </div>
  );
}
