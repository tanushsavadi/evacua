"use client";

import { useEffect, useRef, useState } from "react";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { Household } from "@/lib/schemas/household";
import type { Plan, PlanState } from "@/lib/schemas/plan";

export function usePlan(options: {
  household: Household | null;
  events: CrisisEvent[];
  state: PlanState;
}) {
  const { household, events, state } = options;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [prevPlan, setPrevPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hash of inputs that should trigger regeneration
  const sigRef = useRef<string>("");

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
          if (current)
            setPrevPlan({
              ...current,
              version: current.version,
            });
          return {
            ...data,
            version: (current?.version ?? 0) + 1,
          };
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

  return { plan, prevPlan, loading, error };
}
