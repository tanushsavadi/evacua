import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { Plan, PlanTask } from "@/lib/schemas/plan";
import type { DiffTrigger, PlanDiff } from "@/lib/schemas/plan-diff";

/**
 * The Diff Narrator computes a structured, tone-aware summary of what moved
 * between two plans and why. It runs fully client-side and deterministically —
 * no network hop — so the Ember Field drawer can pop the instant a re-plan
 * lands, which is the whole point of the closed loop.
 */

const STATE_RANK: Record<Plan["state"], number> = {
  watch: 0,
  prepare: 1,
  leave: 2,
};

function minutesBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  // Positive = new plan is earlier (more urgent).
  return Math.round((ta - tb) / 60_000);
}

function tasksDiff(
  prev: PlanTask[],
  next: PlanTask[],
): { added: PlanTask[]; removed: PlanTask[]; elevated: PlanTask[] } {
  const prevByText = new Map(prev.map((t) => [t.text.toLowerCase(), t]));
  const nextByText = new Map(next.map((t) => [t.text.toLowerCase(), t]));

  const added: PlanTask[] = [];
  const elevated: PlanTask[] = [];
  for (const t of next) {
    const p = prevByText.get(t.text.toLowerCase());
    if (!p) {
      added.push(t);
      continue;
    }
    if (
      priorityRank(t.priority) > priorityRank(p.priority) &&
      t.priority === "high"
    ) {
      elevated.push(t);
    }
  }

  const removed: PlanTask[] = [];
  for (const t of prev) {
    if (!nextByText.has(t.text.toLowerCase())) removed.push(t);
  }

  return { added, removed, elevated };
}

function priorityRank(p: PlanTask["priority"]) {
  if (p === "high") return 2;
  if (p === "medium") return 1;
  return 0;
}

function pickTriggers(
  prevEvents: CrisisEvent[],
  nextEvents: CrisisEvent[],
): DiffTrigger[] {
  const prevById = new Map(prevEvents.map((e) => [e.id, e]));
  const candidates = nextEvents
    .map((e) => {
      const prev = prevById.get(e.id);
      const prevImpact = prev?.impact ?? 0;
      const nextImpact = e.impact ?? 0;
      const delta = nextImpact - prevImpact;
      // A trigger is either new, or its impact rose, or it's very high now.
      const isNew = !prev;
      const score = isNew
        ? nextImpact + 0.2
        : delta > 0.1
          ? nextImpact + delta
          : nextImpact > 0.6
            ? nextImpact
            : -1;
      return { event: e, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ event: e }) => ({
      id: e.id,
      headline: e.headline,
      kind: e.kind,
      source: e.source,
      impact: e.impact,
    }));
  return candidates;
}

function formatDestinationLabel(dest?: { label?: string; address?: string }) {
  if (!dest) return "";
  if (dest.label && dest.address) return `${dest.label} (${dest.address})`;
  return dest.label || dest.address || "";
}

function composeHeadline(d: {
  stateChanged: boolean;
  prevState: Plan["state"];
  nextState: Plan["state"];
  primaryRouteChanged: boolean;
  prevPrimary?: Plan["routes"][number];
  nextPrimary?: Plan["routes"][number];
  destinationChanged: boolean;
  prevDestination?: { label: string; address: string };
  nextDestination?: { label: string; address: string };
  leaveByDeltaMin: number;
  added: PlanTask[];
}): string {
  if (d.stateChanged) {
    if (d.nextState === "leave") return "Go now. Plan is now an evacuation.";
    if (d.nextState === "prepare" && d.prevState === "watch")
      return "Ready-set posture — prepare to leave.";
    if (d.nextState === "watch") return "Conditions easing — back to watch.";
    return `Posture shifted ${d.prevState} to ${d.nextState}.`;
  }
  if (d.primaryRouteChanged && d.nextPrimary) {
    return `Primary route rerouted via ${d.nextPrimary.via ?? d.nextPrimary.summary.split(",")[0]}.`;
  }
  if (d.destinationChanged && d.nextDestination) {
    return `New destination — ${d.nextDestination.label}.`;
  }
  if (Math.abs(d.leaveByDeltaMin) >= 10) {
    return d.leaveByDeltaMin > 0
      ? `Leave-by moved up ${d.leaveByDeltaMin} minutes.`
      : `Leave-by pushed back ${Math.abs(d.leaveByDeltaMin)} minutes.`;
  }
  if (d.added.some((t) => t.priority === "high")) {
    return `New high-priority action added.`;
  }
  return "Plan updated with fresh signals.";
}

function composeNarrative(args: {
  headline: string;
  stateChanged: boolean;
  prevState: Plan["state"];
  nextState: Plan["state"];
  primaryRouteChanged: boolean;
  prevPrimary?: Plan["routes"][number];
  nextPrimary?: Plan["routes"][number];
  destinationChanged: boolean;
  prevDestination?: { label: string; address: string };
  nextDestination?: { label: string; address: string };
  leaveByDeltaMin: number;
  added: PlanTask[];
  removed: PlanTask[];
  triggers: DiffTrigger[];
}): string {
  const parts: string[] = [];

  if (args.stateChanged) {
    if (args.nextState === "leave")
      parts.push(
        "Conditions now warrant evacuation. Your plan is live — follow tasks in order.",
      );
    else if (args.nextState === "prepare")
      parts.push(
        "Signals are consistent enough to pre-stage your go-bag and keys.",
      );
    else parts.push("Threat levels dropped; keep your plan primed but stand down.");
  }

  if (args.primaryRouteChanged && args.nextPrimary) {
    const prevVia = args.prevPrimary?.via ?? args.prevPrimary?.summary;
    const nextVia = args.nextPrimary.via ?? args.nextPrimary.summary;
    if (prevVia && prevVia !== nextVia) {
      parts.push(
        `Primary route switched from ${prevVia} to ${nextVia} based on the latest closures.`,
      );
    } else {
      parts.push(
        `Primary route refreshed — new ETA ${Math.round(args.nextPrimary.durationMin)} min.`,
      );
    }
  }

  if (args.destinationChanged && args.nextDestination) {
    parts.push(
      `Destination reassigned to ${formatDestinationLabel(args.nextDestination)} because previous target is no longer safe or reachable.`,
    );
  }

  if (Math.abs(args.leaveByDeltaMin) >= 10) {
    parts.push(
      args.leaveByDeltaMin > 0
        ? `Leave-by moved ${args.leaveByDeltaMin} minutes earlier — act sooner.`
        : `Leave-by pushed back ${Math.abs(args.leaveByDeltaMin)} minutes — a little more runway.`,
    );
  }

  if (args.added.length) {
    const highs = args.added.filter((t) => t.priority === "high");
    if (highs.length) {
      const first = highs[0];
      parts.push(
        `Added high-priority task: ${first.text}${highs.length > 1 ? ` (+${highs.length - 1} more)` : ""}.`,
      );
    } else {
      parts.push(`Added ${args.added.length} supporting step${args.added.length > 1 ? "s" : ""}.`);
    }
  }

  if (args.triggers.length) {
    const headline = args.triggers[0].headline;
    parts.push(`Trigger: ${headline}.`);
  }

  if (!parts.length) return "Small refinements to your plan based on the latest signals.";
  return parts.join(" ");
}

function deriveSeverity(args: {
  stateChanged: boolean;
  nextState: Plan["state"];
  prevState: Plan["state"];
  primaryRouteChanged: boolean;
  destinationChanged: boolean;
  leaveByDeltaMin: number;
  added: PlanTask[];
}): PlanDiff["severity"] {
  if (args.stateChanged) {
    if (args.nextState === "leave") return "urgent";
    if (STATE_RANK[args.nextState] > STATE_RANK[args.prevState]) return "notable";
    return "calm";
  }
  if (args.primaryRouteChanged) return "notable";
  if (args.destinationChanged) return "notable";
  if (args.leaveByDeltaMin >= 10) return "notable";
  if (args.added.some((t) => t.priority === "high")) return "notable";
  return "calm";
}

/**
 * `computeDiff` returns null when the change isn't worth surfacing —
 * e.g. a cosmetic reordering of medium-priority tasks. This is the throttle
 * that keeps the Ember Field from popping on every poll.
 */
export function computeDiff(input: {
  prevPlan: Plan;
  nextPlan: Plan;
  prevEvents: CrisisEvent[];
  nextEvents: CrisisEvent[];
}): PlanDiff | null {
  const { prevPlan, nextPlan, prevEvents, nextEvents } = input;

  const stateChanged = prevPlan.state !== nextPlan.state;

  const prevPrimary = prevPlan.routes.find((r) => r.id === prevPlan.primaryRouteId);
  const nextPrimary = nextPlan.routes.find((r) => r.id === nextPlan.primaryRouteId);
  const primaryRouteChanged = Boolean(
    (prevPrimary?.via ?? prevPrimary?.summary ?? "") !==
      (nextPrimary?.via ?? nextPrimary?.summary ?? ""),
  );

  const leaveByDeltaMin = minutesBetween(
    prevPlan.leaveByIso,
    nextPlan.leaveByIso,
  );

  const destinationChanged =
    prevPlan.destination.coords.lat !== nextPlan.destination.coords.lat ||
    prevPlan.destination.coords.lng !== nextPlan.destination.coords.lng;

  const { added, removed, elevated } = tasksDiff(prevPlan.tasks, nextPlan.tasks);

  const triggers = pickTriggers(prevEvents, nextEvents);

  const material =
    stateChanged ||
    primaryRouteChanged ||
    destinationChanged ||
    Math.abs(leaveByDeltaMin) >= 5 ||
    added.some((t) => t.priority === "high") ||
    elevated.length > 0 ||
    (added.length >= 2 && triggers.length > 0);

  if (!material) return null;

  const prevDestinationSnap = destinationChanged
    ? { label: prevPlan.destination.label, address: prevPlan.destination.address }
    : undefined;
  const nextDestinationSnap = destinationChanged
    ? { label: nextPlan.destination.label, address: nextPlan.destination.address }
    : undefined;

  const headline = composeHeadline({
    stateChanged,
    prevState: prevPlan.state,
    nextState: nextPlan.state,
    primaryRouteChanged,
    prevPrimary,
    nextPrimary,
    destinationChanged,
    prevDestination: prevDestinationSnap,
    nextDestination: nextDestinationSnap,
    leaveByDeltaMin,
    added,
  });

  const narrative = composeNarrative({
    headline,
    stateChanged,
    prevState: prevPlan.state,
    nextState: nextPlan.state,
    primaryRouteChanged,
    prevPrimary,
    nextPrimary,
    destinationChanged,
    prevDestination: prevDestinationSnap,
    nextDestination: nextDestinationSnap,
    leaveByDeltaMin,
    added,
    removed,
    triggers,
  });

  const severity = deriveSeverity({
    stateChanged,
    nextState: nextPlan.state,
    prevState: prevPlan.state,
    primaryRouteChanged,
    destinationChanged,
    leaveByDeltaMin,
    added,
  });

  return {
    id: `diff_${nextPlan.id}`,
    createdAt: new Date().toISOString(),
    prevPlanId: prevPlan.id,
    nextPlanId: nextPlan.id,

    stateChanged,
    prevState: prevPlan.state,
    nextState: nextPlan.state,

    primaryRouteChanged,
    prevPrimary,
    nextPrimary,

    leaveByDeltaMin,
    prevLeaveByIso: prevPlan.leaveByIso,
    nextLeaveByIso: nextPlan.leaveByIso,

    destinationChanged,
    prevDestination: prevDestinationSnap,
    nextDestination: nextDestinationSnap,

    addedTasks: added,
    removedTasks: removed,
    elevatedTasks: elevated,

    triggers,
    severity,

    headline,
    narrative,
    author: "fallback",
  };
}
