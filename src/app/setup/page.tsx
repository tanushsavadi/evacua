"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import Link from "next/link";
import { toast } from "sonner";
import { Stepper } from "@/components/setup/stepper";
import { StepAddress } from "@/components/setup/steps/step-address";
import { StepPeople } from "@/components/setup/steps/step-people";
import { StepConstraints } from "@/components/setup/steps/step-constraints";
import { StepLogistics } from "@/components/setup/steps/step-logistics";
import { StepReview } from "@/components/setup/steps/step-review";
import { Wordmark } from "@/components/landing/wordmark";
import { useHouseholdStore } from "@/lib/store/household";
import type { Household } from "@/lib/schemas/household";
import { HouseholdSchema } from "@/lib/schemas/household";

const STEPS = [
  { id: "address", label: "Home" },
  { id: "people", label: "People" },
  { id: "constraints", label: "Needs" },
  { id: "logistics", label: "Logistics" },
  { id: "review", label: "Review" },
];

export default function SetupPage() {
  const router = useRouter();
  const { draft, household, setDraft, commit } = useHouseholdStore();
  const initial = useMemo(
    () => ({ ...(household ?? {}), ...draft }) as Partial<Household>,
    [draft, household],
  );
  const [stepIndex, setStepIndex] = useState(0);

  const goBack = () => {
    if (stepIndex === 0) router.push("/");
    else setStepIndex((i) => Math.max(0, i - 1));
  };
  const goNext = () => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));

  const handleConfirm = () => {
    const now = new Date().toISOString();
    const candidate: Household = {
      id: household?.id ?? `hh_${Math.random().toString(36).slice(2, 10)}`,
      createdAt: household?.createdAt ?? now,
      updatedAt: now,
      address: initial.address ?? "",
      coords: initial.coords ?? { lat: 0, lng: 0 },
      displayName: initial.displayName,
      dwelling: initial.dwelling ?? "single_family",
      floors: initial.floors,
      accessNotes: initial.accessNotes ?? "",
      members: initial.members ?? [],
      pets: initial.pets ?? [],
      medications: initial.medications ?? [],
      mobilityNotes: initial.mobilityNotes ?? "",
      vehicles: initial.vehicles ?? [],
      contacts: initial.contacts ?? [],
      destinations: initial.destinations ?? [],
    };

    const parsed = HouseholdSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ?? "Please review the form",
      );
      return;
    }
    commit(parsed.data);
    toast.success("Household ready. Opening the command center.");
    router.push("/plan");
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 evacua-grid opacity-[0.18] pointer-events-none" />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-[color-mix(in_oklab,var(--color-ember)_8%,transparent)] to-transparent pointer-events-none"
      />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 pt-7 md:px-10">
        <Link href="/" className="inline-flex">
          <Wordmark />
        </Link>
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          Calm setup
        </div>
      </header>

      <div className="relative z-10 mx-auto mt-8 flex max-w-5xl justify-center px-6">
        <Stepper current={stepIndex} steps={STEPS} />
      </div>

      <main className="relative z-10 mx-auto mt-10 max-w-2xl px-6 pb-20 md:mt-14">
        <AnimatePresence mode="wait">
          {stepIndex === 0 && (
            <StepAddress
              key="s1"
              initial={{
                address: initial.address,
                coords: initial.coords,
                displayName: initial.displayName,
                dwelling: initial.dwelling,
                floors: initial.floors,
                accessNotes: initial.accessNotes,
              }}
              onBack={goBack}
              onNext={(v) => {
                setDraft(v);
                goNext();
              }}
            />
          )}
          {stepIndex === 1 && (
            <StepPeople
              key="s2"
              initial={initial.members}
              onBack={goBack}
              onNext={(members) => {
                setDraft({ members });
                goNext();
              }}
            />
          )}
          {stepIndex === 2 && (
            <StepConstraints
              key="s3"
              initial={{
                pets: initial.pets,
                medications: initial.medications,
                mobilityNotes: initial.mobilityNotes,
              }}
              onBack={goBack}
              onNext={(v) => {
                setDraft(v);
                goNext();
              }}
            />
          )}
          {stepIndex === 3 && (
            <StepLogistics
              key="s4"
              initial={{
                vehicles: initial.vehicles,
                contacts: initial.contacts,
                destinations: initial.destinations,
              }}
              onBack={goBack}
              onNext={(v) => {
                setDraft(v);
                goNext();
              }}
            />
          )}
          {stepIndex === 4 && (
            <StepReview
              key="s5"
              draft={initial}
              onBack={goBack}
              onConfirm={handleConfirm}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
