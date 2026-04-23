"use client";

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CommandTopBar } from "@/components/command-center/top-bar";
import { HouseholdPanel } from "@/components/command-center/household-panel";
import { MapPanel } from "@/components/command-center/map-panel";
import { PlanPanel } from "@/components/command-center/plan-panel";
import { SignalsRail } from "@/components/command-center/signals-rail";
import { useSignals } from "@/lib/hooks/use-signals";
import { usePlan } from "@/lib/hooks/use-plan";
import { useHouseholdStore } from "@/lib/store/household";
import type { Household } from "@/lib/schemas/household";
import { SCENARIOS } from "@/lib/scenarios";

export default function PlanPage() {
  return (
    <Suspense fallback={<PlanShellFallback />}>
      <PlanContents />
    </Suspense>
  );
}

function PlanShellFallback() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-[var(--color-bg-oled)]">
      <div className="h-2 w-24 animate-pulse rounded-full bg-[var(--color-line-subtle)]" />
    </div>
  );
}

const subscribe = () => () => {};

function PlanContents() {
  const searchParams = useSearchParams();
  const demoId = searchParams.get("demo");
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const household = useHouseholdStore((s) => s.household);

  const scenario = demoId ? SCENARIOS[demoId] : undefined;
  const demoHousehold: Household | null = scenario
    ? buildDemoHousehold(scenario.id)
    : null;

  const active = demoHousehold ?? household ?? null;
  const home = mounted && active ? active.coords : null;

  const { data: signals, isFetching } = useSignals({
    home,
    demo: demoId ?? null,
  });

  const { plan, loading: planLoading, latestDiff, acknowledgeDiff } = usePlan({
    household: mounted ? active : null,
    events: signals?.events ?? [],
    state: signals?.state ?? "watch",
  });

  // Fire a toast the first time each diff lands. The Ember Field handles the
  // detailed story — this is just a peripheral cue so the user looks over.
  const lastToastedDiffId = useRef<string | null>(null);
  useEffect(() => {
    if (!latestDiff) return;
    if (lastToastedDiffId.current === latestDiff.id) return;
    lastToastedDiffId.current = latestDiff.id;
    const accent =
      latestDiff.severity === "urgent"
        ? "rgba(255,138,72,0.45)"
        : latestDiff.severity === "notable"
          ? "rgba(255,184,72,0.35)"
          : "rgba(110,231,249,0.3)";
    toast(latestDiff.headline, {
      description: latestDiff.narrative,
      duration: latestDiff.severity === "urgent" ? 7000 : 5000,
      style: {
        boxShadow: `0 0 0 1px ${accent}, 0 24px 60px -20px rgba(0,0,0,0.6)`,
      },
    });
  }, [latestDiff]);

  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>();
  const effectiveSelected = selectedRouteId ?? plan?.primaryRouteId;

  const mode: "live" | "scenario" =
    signals?.mode ?? (demoId ? "scenario" : "live");
  const state = signals?.state ?? "watch";

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-bg-oled)]">
      <CommandTopBar state={state} mode={mode} />

      <main className="grid flex-1 gap-3 overflow-hidden p-3 md:grid-cols-[300px_1fr_380px] md:gap-3 md:p-4 lg:grid-cols-[320px_1fr_420px] lg:p-5">
        <div className="hidden md:grid md:grid-rows-[auto_1fr] md:gap-3">
          <HouseholdPanel
            household={mounted ? active : null}
            signalsSummary={{
              active: signals?.events.length ?? 0,
              lastUpdated: signals?.computedAt,
            }}
          />
          <SignalsRail
            events={signals?.events ?? []}
            mode={mode}
            isFetching={isFetching}
          />
        </div>

        <div className="relative min-h-[50vh] md:min-h-0">
          <MapPanel
            home={home ?? undefined}
            destination={plan?.destination.coords ?? null}
            routes={plan?.routes}
            selectedRouteId={effectiveSelected}
            events={signals?.events ?? []}
          />
        </div>

        <div className="hidden md:block">
          <PlanPanel
            household={mounted ? active : null}
            plan={plan}
            loading={planLoading}
            onSelectRoute={setSelectedRouteId}
            selectedRouteId={effectiveSelected}
            diff={latestDiff}
            onDismissDiff={acknowledgeDiff}
          />
        </div>

        <div className="space-y-3 md:hidden">
          <HouseholdPanel
            household={mounted ? active : null}
            signalsSummary={{ active: signals?.events.length ?? 0 }}
          />
          <SignalsRail
            events={signals?.events ?? []}
            mode={mode}
            isFetching={isFetching}
          />
          <PlanPanel
            household={mounted ? active : null}
            plan={plan}
            loading={planLoading}
            onSelectRoute={setSelectedRouteId}
            selectedRouteId={effectiveSelected}
            diff={latestDiff}
            onDismissDiff={acknowledgeDiff}
          />
        </div>
      </main>
    </div>
  );
}

function buildDemoHousehold(scenarioId: string): Household | null {
  const s = SCENARIOS[scenarioId];
  if (!s) return null;
  const now = new Date().toISOString();
  return {
    id: `demo_${s.id}`,
    createdAt: now,
    updatedAt: now,
    address: `${s.homeLabel}, CA`,
    coords: s.home,
    displayName: `${s.homeLabel} demo`,
    dwelling: "single_family",
    floors: 2,
    accessNotes: "",
    members: [
      { id: "m1", name: "Alex", role: "adult", mobilityNotes: "" },
      { id: "m2", name: "Priya", role: "adult", mobilityNotes: "" },
      { id: "m3", name: "Mia", role: "child", mobilityNotes: "" },
      {
        id: "m4",
        name: "Grandma Rose",
        role: "elder",
        mobilityNotes: "Uses a walker",
      },
    ],
    pets: [{ id: "p1", name: "Luna", species: "dog", carrier: false }],
    medications: [{ id: "md1", name: "Insulin", critical: true }],
    mobilityNotes: "Grandma Rose uses a walker",
    vehicles: [
      { id: "v1", label: "Subaru Outback", seats: 5, fuelState: "half" },
      { id: "v2", label: "Honda Civic", seats: 5, fuelState: "full" },
    ],
    contacts: [
      {
        id: "c1",
        name: "Sister Jen",
        phone: "+1 (818) 555-0142",
        relation: "sibling",
      },
    ],
    destinations: [
      {
        id: "d1",
        label: s.destination.label,
        address: s.destination.address,
        coords: s.destination.coords,
      },
    ],
  };
}
