export type EvacuationPosture = "watch" | "prepare" | "leave";

export type RouteStatus = "available" | "unavailable";

export type EvacuationRoute = {
  id: string;
  label: string;
  status: RouteStatus;
  notes?: string[];
};

export type HouseholdProfile = {
  hasPets: boolean;
};

export type EvacuationAction = {
  id: string;
  label: string;
  status: "pending" | "complete";
  reasonIds: string[];
};

export type HouseholdEvacuationPlan = {
  posture: EvacuationPosture;
  household: HouseholdProfile;
  primaryRouteId: string;
  backupRouteId?: string;
  activeRouteId: string;
  routes: EvacuationRoute[];
  actions: EvacuationAction[];
};

export type RoadClosureSignal = {
  type: "road_closure";
  id: string;
  source: string;
  observedAt: string;
  routeId: string;
  summary: string;
};

export type WindShiftSignal = {
  type: "wind_shift";
  id: string;
  source: string;
  observedAt: string;
  towardHome: boolean;
  summary: string;
};

export type PlanRevisionSignal = RoadClosureSignal | WindShiftSignal;

export type PlanDiff = {
  path: string;
  before: unknown;
  after: unknown;
  reasonIds: string[];
};

export type ExplanationReason = {
  id: string;
  signalId: string;
  summary: string;
  affectedPaths: string[];
};

export type SafetyBoundary = {
  statement: string;
  officialOrdersRemainAuthoritative: true;
};

export type ReviseEvacuationPlanInput = {
  plan: HouseholdEvacuationPlan;
  signals: PlanRevisionSignal[];
};

export type ReviseEvacuationPlanOutput = {
  plan: HouseholdEvacuationPlan;
  diff: PlanDiff[];
  reasons: ExplanationReason[];
  safetyBoundary: SafetyBoundary;
};

const PET_CARRIER_ACTION_ID = "pack-pet-carrier";

const SAFETY_BOUNDARY: SafetyBoundary = {
  statement:
    "Evacua updates household planning assumptions but does not replace official evacuation orders or emergency instructions.",
  officialOrdersRemainAuthoritative: true,
};

export function reviseEvacuationPlan(input: ReviseEvacuationPlanInput): ReviseEvacuationPlanOutput {
  const plan: HouseholdEvacuationPlan = {
    ...input.plan,
    household: { ...input.plan.household },
    routes: input.plan.routes.map((route) => ({
      ...route,
      notes: route.notes ? [...route.notes] : undefined,
    })),
    actions: input.plan.actions.map((action) => ({
      ...action,
      reasonIds: [...action.reasonIds],
    })),
  };
  const diff: PlanDiff[] = [];
  const reasons: ExplanationReason[] = [];

  const addReason = (reason: ExplanationReason) => {
    if (!reasons.some((existing) => existing.id === reason.id)) {
      reasons.push(reason);
    }
  };

  const addDiff = (change: PlanDiff) => {
    if (change.before !== change.after) {
      diff.push(change);
    }
  };

  const primaryClosure = input.signals.find(
    (signal): signal is RoadClosureSignal =>
      signal.type === "road_closure" && signal.routeId === input.plan.primaryRouteId,
  );
  const closedRouteIds = new Set(
    input.signals
      .filter((signal): signal is RoadClosureSignal => signal.type === "road_closure")
      .map((signal) => signal.routeId),
  );

  for (const signal of input.signals) {
    if (signal.type !== "road_closure") continue;

    const route = plan.routes.find((candidate) => candidate.id === signal.routeId);
    if (!route) continue;

    const reasonId = `reason-${signal.id}-route-unavailable`;
    addReason({
      id: reasonId,
      signalId: signal.id,
      summary: `${signal.source}: ${signal.summary}`,
      affectedPaths: [`routes.${signal.routeId}.status`],
    });
    addDiff({
      path: `routes.${signal.routeId}.status`,
      before: route.status,
      after: "unavailable",
      reasonIds: [reasonId],
    });
    route.status = "unavailable";

    if (signal.routeId === input.plan.primaryRouteId && plan.backupRouteId) {
      const backupRoute = plan.routes.find((candidate) => candidate.id === plan.backupRouteId);
      if (backupRoute && backupRoute.status === "available" && !closedRouteIds.has(backupRoute.id) && plan.activeRouteId !== backupRoute.id) {
        const promoteReasonId = `reason-${signal.id}-backup-route-promoted`;
        addReason({
          id: promoteReasonId,
          signalId: signal.id,
          summary: `${signal.source}: primary route blocked, so the backup route is promoted for planning.`,
          affectedPaths: ["activeRouteId"],
        });
        addDiff({
          path: "activeRouteId",
          before: plan.activeRouteId,
          after: backupRoute.id,
          reasonIds: [promoteReasonId],
        });
        plan.activeRouteId = backupRoute.id;
      }
    }
  }

  const windTowardHome = input.signals.find(
    (signal): signal is WindShiftSignal => signal.type === "wind_shift" && signal.towardHome,
  );

  if (windTowardHome && plan.posture === "watch") {
    const reasonId = `reason-${windTowardHome.id}-posture-prepare`;
    addReason({
      id: reasonId,
      signalId: windTowardHome.id,
      summary: `${windTowardHome.source}: ${windTowardHome.summary}`,
      affectedPaths: ["posture"],
    });
    addDiff({
      path: "posture",
      before: plan.posture,
      after: "prepare",
      reasonIds: [reasonId],
    });
    plan.posture = "prepare";
  }

  const petActionSignal = windTowardHome ?? primaryClosure;
  const alreadyHasPetCarrier = plan.actions.some((action) => action.id === PET_CARRIER_ACTION_ID);
  if (plan.household.hasPets && plan.posture !== "watch" && petActionSignal && !alreadyHasPetCarrier) {
    const reasonId = `reason-${petActionSignal.id}-pet-carrier`;
    const action: EvacuationAction = {
      id: PET_CARRIER_ACTION_ID,
      label: "Pack pet carrier and supplies",
      status: "pending",
      reasonIds: [reasonId],
    };
    addReason({
      id: reasonId,
      signalId: petActionSignal.id,
      summary: `${petActionSignal.source}: household plan includes pets, so pet transport needs to be ready during this revision.`,
      affectedPaths: ["actions"],
    });
    addDiff({
      path: "actions",
      before: input.plan.actions,
      after: [...plan.actions, action],
      reasonIds: [reasonId],
    });
    plan.actions = [...plan.actions, action];
  }

  return {
    plan,
    diff,
    reasons,
    safetyBoundary: SAFETY_BOUNDARY,
  };
}
