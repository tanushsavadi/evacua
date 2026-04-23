"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeDiff } from "@/lib/agents/diff-narrator";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { Household } from "@/lib/schemas/household";
import type { Plan, PlanState } from "@/lib/schemas/plan";
import type { PlanDiff } from "@/lib/schemas/plan-diff";

/**
 * `usePlan` owns the plan lifecycle: re-fetch on meaningful signal changes,
 * hold the previous plan for diffing, and surface the latest unacknowledged
 * PlanDiff so the Ember Field drawer can render a clear "what changed" story.
 */
export function usePlan(options: {
  household: Household | null;
  events: CrisisEvent[];
  state: PlanState;
}) {
  const { household, events, state } = options;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [prevPlan, setPrevPlan] = useState<Plan | null>(null);
  const [latestDiff, setLatestDiff] = useState<PlanDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track signal inputs that should cause a re-plan.
  const sigRef = useRef<string>("");
  // Snapshot of events we last saw a plan against, used to pick diff triggers.
  const prevEventsRef = useRef<CrisisEvent[]>([]);

  useEffect(() => {
    if (!household) return;

    const topIds = events
      .slice(0, 4)
      .map((e) => `${e.id}:${e.impact?.toFixed(2) ?? ""}`)
      .join("|");
    const sig = `${state}|${topIds}`;

    if (sig === sigRef.current) return;
    sigRef.current = sig;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ household, events, state }),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || `plan ${res.status}`);
        }
        const data = (await res.json()) as Plan;
        if (cancelled) return;

        setPlan((current) => {
          const nextVersion = (current?.version ?? 0) + 1;
          const nextPlan: Plan = { ...data, version: nextVersion };

          if (current) {
            setPrevPlan({ ...current });
            const diff = computeDiff({
              prevPlan: current,
              nextPlan,
              prevEvents: prevEventsRef.current,
              nextEvents: events,
            });
            if (diff) setLatestDiff(diff);
          }

          prevEventsRef.current = events;
          return nextPlan;
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "plan error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [household, events, state]);

  const acknowledgeDiff = useCallback(() => {
    setLatestDiff(null);
  }, []);

  return {
    plan,
    prevPlan,
    latestDiff,
    acknowledgeDiff,
    loading,
    error,
  };
}
