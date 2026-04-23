"use client";

import { Suspense, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { CommandTopBar } from "@/components/command-center/top-bar";
import { HouseholdPanel } from "@/components/command-center/household-panel";
import { MapPanel } from "@/components/command-center/map-panel";
import { PlanPanel } from "@/components/command-center/plan-panel";
import { useHouseholdStore } from "@/lib/store/household";
import type { Household } from "@/lib/schemas/household";

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
  // useSyncExternalStore avoids hydration mismatches for idb-backed state
  // without calling setState inside an effect.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const household = useHouseholdStore((s) => s.household);

  const demoHousehold: Household | null = demoId
    ? {
        id: `demo_${demoId}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        address: "1250 Sunset Blvd, Pacific Palisades, CA",
        coords: { lat: 34.0489, lng: -118.5553 },
        displayName: "Pacific Palisades demo",
        dwelling: "single_family",
        floors: 2,
        accessNotes: "Narrow driveway, steep hill",
        members: [
          { id: "m1", name: "Alex", role: "adult", mobilityNotes: "" },
          { id: "m2", name: "Priya", role: "adult", mobilityNotes: "" },
          { id: "m3", name: "Mia", role: "child", mobilityNotes: "" },
          { id: "m4", name: "Grandma Rose", role: "elder", mobilityNotes: "Uses a walker" },
        ],
        pets: [
          { id: "p1", name: "Luna", species: "dog", carrier: false },
          { id: "p2", name: "Beans", species: "cat", carrier: true },
        ],
        medications: [
          { id: "md1", name: "Insulin", critical: true },
          { id: "md2", name: "Inhaler", critical: false },
        ],
        mobilityNotes: "Grandma Rose uses a walker",
        vehicles: [
          { id: "v1", label: "Subaru Outback", seats: 5, fuelState: "half" },
          { id: "v2", label: "Honda Civic", seats: 5, fuelState: "full" },
        ],
        contacts: [
          { id: "c1", name: "Sister Jen", phone: "+1 (818) 555-0142", relation: "sibling" },
        ],
        destinations: [
          {
            id: "d1",
            label: "Sister Jen's (Burbank)",
            address: "225 N Hollywood Way, Burbank, CA",
            coords: { lat: 34.1833, lng: -118.3231 },
          },
        ],
      }
    : null;

  const active = demoHousehold ?? household ?? null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-bg-oled)]">
      <CommandTopBar state="watch" mode={demoId ? "scenario" : "live"} />

      <main className="grid flex-1 gap-3 overflow-hidden p-3 md:grid-cols-[280px_1fr_360px] md:gap-3 md:p-4 lg:grid-cols-[300px_1fr_400px] lg:p-5">
        <div className="hidden md:block">
          <HouseholdPanel
            household={mounted ? active : null}
            signalsSummary={{ active: 0 }}
          />
        </div>

        <div className="relative min-h-[50vh] md:min-h-0">
          <MapPanel
            home={mounted && active ? active.coords : undefined}
            destination={
              mounted && active?.destinations?.[0]?.coords
                ? active.destinations[0].coords
                : null
            }
          />
        </div>

        <div className="hidden md:block">
          <PlanPanel household={mounted ? active : null} />
        </div>

        {/* Mobile stack — household + plan below the map */}
        <div className="space-y-3 md:hidden">
          <HouseholdPanel
            household={mounted ? active : null}
            signalsSummary={{ active: 0 }}
          />
          <PlanPanel household={mounted ? active : null} />
        </div>
      </main>
    </div>
  );
}
