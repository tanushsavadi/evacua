import { describe, expect, it } from "vitest";
import {
  reviseEvacuationPlan,
  type HouseholdEvacuationPlan,
  type PlanRevisionSignal,
} from "./revision";

function basePlan(overrides: Partial<HouseholdEvacuationPlan> = {}): HouseholdEvacuationPlan {
  return {
    posture: "watch",
    household: { hasPets: true },
    primaryRouteId: "ridge-road",
    backupRouteId: "valley-road",
    activeRouteId: "ridge-road",
    routes: [
      { id: "ridge-road", label: "Ridge Road", status: "available" },
      { id: "valley-road", label: "Valley Road", status: "available" },
    ],
    actions: [],
    ...overrides,
  };
}

const primaryClosure: PlanRevisionSignal = {
  type: "road_closure",
  id: "sig-road-1",
  source: "county-roads",
  observedAt: "2026-05-04T12:00:00.000Z",
  routeId: "ridge-road",
  summary: "Ridge Road is closed between mile markers 4 and 8.",
};

const windTowardHome: PlanRevisionSignal = {
  type: "wind_shift",
  id: "sig-wind-1",
  source: "nws",
  observedAt: "2026-05-04T12:05:00.000Z",
  towardHome: true,
  summary: "Wind shifted northeast toward the household location.",
};

describe("reviseEvacuationPlan", () => {
  it("updates route, posture, pet action, diff, reasons, and safety boundary for the target scenario", () => {
    const output = reviseEvacuationPlan({
      plan: basePlan(),
      signals: [primaryClosure, windTowardHome],
    });

    expect(output.plan.routes.find((route) => route.id === "ridge-road")?.status).toBe("unavailable");
    expect(output.plan.activeRouteId).toBe("valley-road");
    expect(output.plan.posture).toBe("prepare");
    expect(output.plan.actions).toContainEqual({
      id: "pack-pet-carrier",
      label: "Pack pet carrier and supplies",
      status: "pending",
      reasonIds: ["reason-sig-wind-1-pet-carrier"],
    });
    expect(output.diff.map((change) => change.path)).toEqual([
      "routes.ridge-road.status",
      "activeRouteId",
      "posture",
      "actions",
    ]);
    expect(output.reasons.map((reason) => reason.signalId)).toEqual([
      "sig-road-1",
      "sig-road-1",
      "sig-wind-1",
      "sig-wind-1",
    ]);
    expect(output.safetyBoundary).toEqual({
      statement:
        "Evacua updates household planning assumptions but does not replace official evacuation orders or emergency instructions.",
      officialOrdersRemainAuthoritative: true,
    });
  });

  it("does not promote the backup route when a closure affects a non-primary route", () => {
    const output = reviseEvacuationPlan({
      plan: basePlan(),
      signals: [
        {
          type: "road_closure",
          id: "sig-road-2",
          source: "county-roads",
          observedAt: "2026-05-04T12:10:00.000Z",
          routeId: "valley-road",
          summary: "Valley Road has a partial closure.",
        },
      ],
    });

    expect(output.plan.routes.find((route) => route.id === "valley-road")?.status).toBe("unavailable");
    expect(output.plan.activeRouteId).toBe("ridge-road");
    expect(output.plan.actions).toEqual([]);
    expect(output.diff.some((change) => change.path === "activeRouteId")).toBe(false);
  });

  it("escalates watch to prepare for wind toward home without adding pet actions for pet-free households", () => {
    const output = reviseEvacuationPlan({
      plan: basePlan({ household: { hasPets: false } }),
      signals: [windTowardHome],
    });

    expect(output.plan.posture).toBe("prepare");
    expect(output.plan.actions).toEqual([]);
  });

  it("does not downgrade prepare or leave postures", () => {
    expect(
      reviseEvacuationPlan({
        plan: basePlan({ posture: "prepare" }),
        signals: [windTowardHome],
      }).plan.posture,
    ).toBe("prepare");

    expect(
      reviseEvacuationPlan({
        plan: basePlan({ posture: "leave" }),
        signals: [windTowardHome],
      }).plan.posture,
    ).toBe("leave");
  });

  it("does not duplicate the pet-carrier action on repeated revisions", () => {
    const first = reviseEvacuationPlan({
      plan: basePlan(),
      signals: [primaryClosure, windTowardHome],
    });
    const second = reviseEvacuationPlan({
      plan: first.plan,
      signals: [primaryClosure, windTowardHome],
    });

    expect(second.plan.actions.filter((action) => action.id === "pack-pet-carrier")).toHaveLength(1);
    expect(second.plan.activeRouteId).toBe(first.plan.activeRouteId);
    expect(second.plan.posture).toBe(first.plan.posture);
  });

  it("marks the primary route unavailable without silently changing active route when no backup exists", () => {
    const output = reviseEvacuationPlan({
      plan: basePlan({ backupRouteId: undefined }),
      signals: [primaryClosure],
    });

    expect(output.plan.routes.find((route) => route.id === "ridge-road")?.status).toBe("unavailable");
    expect(output.plan.activeRouteId).toBe("ridge-road");
    expect(output.plan.actions).toEqual([]);
    expect(output.diff.map((change) => change.path)).not.toContain("activeRouteId");
    expect(output.reasons.some((reason) => reason.signalId === "sig-road-1")).toBe(true);
  });

  it("does not promote a backup route that is also closed in the same revision", () => {
    const output = reviseEvacuationPlan({
      plan: basePlan(),
      signals: [
        primaryClosure,
        {
          type: "road_closure",
          id: "sig-road-2",
          source: "county-roads",
          observedAt: "2026-05-04T12:10:00.000Z",
          routeId: "valley-road",
          summary: "Valley Road is also closed.",
        },
      ],
    });

    expect(output.plan.routes.find((route) => route.id === "ridge-road")?.status).toBe("unavailable");
    expect(output.plan.routes.find((route) => route.id === "valley-road")?.status).toBe("unavailable");
    expect(output.plan.activeRouteId).toBe("ridge-road");
    expect(output.diff.map((change) => change.path)).not.toContain("activeRouteId");
  });
});
