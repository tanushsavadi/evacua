import type {
  AgentOpsSnapshot,
  FireStateIncident,
  FireStateSnapshot,
  ResponderStatsSnapshot,
  RouteOpsSnapshot,
} from "@/lib/ops/supabase-fire-ops";
import type {
  OpusCommanderAction,
  OpusCommanderActionType,
  OpusCommanderResponse,
  OpusCommanderRiskLevel,
} from "@/lib/opus-commander";

export type EvacuaAgentRole =
  | "command"
  | "operations"
  | "planning"
  | "logistics"
  | "communications"
  | "safety";

export type EvacuaMissionStatus = "complete" | "running" | "approval_required" | "blocked";

export type EvacuaIncidentTriageItem = {
  rank: number;
  incidentId: string;
  incidentName: string;
  priority: "immediate" | "high" | "monitor";
  riskLevel: FireStateIncident["risk_level"];
  posture: OpusCommanderRiskLevel;
  containment: number;
  growthRate: number;
  riskScore: number;
  nearestStationName?: string;
  nearestStationDistanceKm?: number;
  availableTeams: number;
  routeAdvisoryCount: number;
  evacuationZoneCount: number;
  rationale: string;
};

export type EvacuaDispatchWorkflowStep = {
  id: string;
  label: string;
  status: EvacuaMissionStatus;
  detail: string;
  evidence?: string;
};

export type EvacuaAgentTask = {
  id: string;
  role: EvacuaAgentRole;
  status: EvacuaMissionStatus;
  title: string;
  detail: string;
  evidence: string;
};

export type EvacuaIcsArtifacts = {
  incidentBrief: string;
  objectives: string[];
  organization: Array<{
    role: EvacuaAgentRole;
    assignment: string;
    output: string;
  }>;
  communications: string;
  safetyMessage: string;
  resourceSummary: string;
};

export type EvacuaApprovalQueueItem = {
  id: string;
  actionId: string;
  type: OpusCommanderActionType;
  title: string;
  status: "queued_for_operator" | "not_required";
  rationale: string;
};

export type EvacuaAutonomousMission = {
  mode: "autonomous_operation";
  summary: string;
  selectedIncidentId: string;
  selectedIncidentName: string;
  triage: EvacuaIncidentTriageItem[];
  tasks: EvacuaAgentTask[];
  dispatchWorkflow: EvacuaDispatchWorkflowStep[];
  icsArtifacts: EvacuaIcsArtifacts;
  approvalQueue: EvacuaApprovalQueueItem[];
  escalationNote: string;
  spokenUpdate: string;
};

const riskWeight: Record<FireStateIncident["risk_level"], number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function postureForRisk(fire: FireStateIncident): OpusCommanderRiskLevel {
  if (fire.risk_level === "critical") return "leave";
  if (fire.risk_level === "high" || fire.growth_rate >= 35 || fire.containment < 25) return "prepare";
  return "watch";
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const radius = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function stationStats(responderStats: ResponderStatsSnapshot, stationId?: number) {
  if (!stationId) return null;
  return responderStats.stats.find((stat) => stat.firestation_id === stationId) ?? null;
}

function nearestStation(fireState: FireStateSnapshot, fire: FireStateIncident) {
  return fireState.firestations.reduce<{
    id: number;
    name: string;
    distanceKm: number;
  } | null>((best, station) => {
    const distance = distanceKm({ lat: fire.lat, lon: fire.lon }, { lat: station.lat, lon: station.lon });
    if (!best || distance < best.distanceKm) {
      return {
        id: station.id,
        name: station.name,
        distanceKm: distance,
      };
    }
    return best;
  }, null);
}

function relatedRoutes(routeOps: RouteOpsSnapshot, fire: FireStateIncident) {
  return routeOps.routes.filter((route) => route.fire_id === fire.id || route.fire_name === fire.name);
}

function relatedEvacuations(routeOps: RouteOpsSnapshot, fire: FireStateIncident) {
  return routeOps.evacuations.filter((zone) => zone.fire_id === fire.id);
}

function buildIncidentTriage(args: {
  fireState: FireStateSnapshot;
  responderStats: ResponderStatsSnapshot;
  routeOps: RouteOpsSnapshot;
}) {
  const scored = args.fireState.fires.map((fire) => {
    const nearest = nearestStation(args.fireState, fire);
    const stats = stationStats(args.responderStats, nearest?.id);
    const routes = relatedRoutes(args.routeOps, fire);
    const evacuations = relatedEvacuations(args.routeOps, fire);
    const availableTeams = stats?.available_teams ?? args.responderStats.totals.available;
    const score =
      riskWeight[fire.risk_level] * 100 +
      Math.max(0, fire.growth_rate) * 1.8 +
      Math.max(0, 100 - fire.containment) * 0.8 +
      Math.max(0, fire.estimated_radius / 120) +
      routes.length * 18 +
      evacuations.length * 16 +
      (availableTeams <= 0 ? 35 : 0) +
      (nearest && nearest.distanceKm > 120 ? 22 : 0);

    return {
      fire,
      nearest,
      availableTeams,
      routeAdvisoryCount: routes.length,
      evacuationZoneCount: evacuations.length,
      score,
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map<EvacuaIncidentTriageItem>((item, index) => {
      const priority =
        item.fire.risk_level === "critical" || index === 0
          ? "immediate"
          : item.fire.risk_level === "high" || item.score >= 260
            ? "high"
            : "monitor";
      const posture = postureForRisk(item.fire);

      return {
        rank: index + 1,
        incidentId: item.fire.id,
        incidentName: item.fire.name,
        priority,
        riskLevel: item.fire.risk_level,
        posture,
        containment: item.fire.containment,
        growthRate: item.fire.growth_rate,
        riskScore: Number(item.score.toFixed(1)),
        nearestStationName: item.nearest?.name,
        nearestStationDistanceKm: item.nearest ? Number(item.nearest.distanceKm.toFixed(1)) : undefined,
        availableTeams: item.availableTeams,
        routeAdvisoryCount: item.routeAdvisoryCount,
        evacuationZoneCount: item.evacuationZoneCount,
        rationale: [
          `${item.fire.risk_level} risk`,
          `${Math.round(item.fire.growth_rate)} m/min growth`,
          `${Math.round(item.fire.containment)}% containment`,
          item.nearest ? `${item.nearest.name} ${item.nearest.distanceKm.toFixed(1)} km away` : "no station distance",
          `${item.availableTeams} available team(s)`,
        ].join(" | "),
      };
    });
}

function approvalQueue(actions: OpusCommanderAction[] = []): EvacuaApprovalQueueItem[] {
  return actions
    .filter((action) => action.requiresApproval)
    .map((action) => ({
      id: `approval-${action.id}`,
      actionId: action.id,
      type: action.type,
      title: action.title,
      status: "queued_for_operator",
      rationale: action.rationale,
    }));
}

function buildEscalationNote(args: {
  triage: EvacuaIncidentTriageItem[];
  responderStats: ResponderStatsSnapshot;
}) {
  const immediateCount = args.triage.filter((item) => item.priority === "immediate").length;
  const constrained =
    args.responderStats.totals.available <= 1 ||
    args.responderStats.totals.dispatched + args.responderStats.totals.active >= args.responderStats.totals.available;

  if (immediateCount > 1 && constrained) {
    return "Multiple immediate-priority incidents are competing for limited local resources. Flag mutual-aid review with geographic-area coordination.";
  }

  if (constrained) {
    return "Local resources look constrained. Keep dispatch approval focused on the highest-ranked incident and prepare a mutual-aid note if conditions worsen.";
  }

  return "Local response capacity is still available. Continue local dispatch review before escalating beyond the operations center.";
}

function buildDispatchWorkflow(args: {
  selectedFire: FireStateIncident;
  selectedTriage: EvacuaIncidentTriageItem;
  plan: Partial<OpusCommanderResponse>;
  approvalItems: EvacuaApprovalQueueItem[];
  agentOps?: AgentOpsSnapshot | null;
  escalationNote: string;
}): EvacuaDispatchWorkflowStep[] {
  const dispatchAction = args.plan.recommendedActions?.find((action) => action.type === "dispatch");
  const routeCreated = args.agentOps?.createdRouteUpdates.some(
    (route) => route.fire_id === args.selectedFire.id || route.fire_name === args.selectedFire.name,
  );
  const evacuationCreated = args.agentOps?.createdEvacuations.some((zone) => zone.fire_id === args.selectedFire.id);

  return [
    {
      id: "initial-report",
      label: "Initial report",
      status: "complete",
      detail: `${args.selectedFire.name} received as the current mission incident.`,
      evidence: `${args.selectedFire.risk_level} risk, updated ${new Date(args.selectedFire.last_update).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
    },
    {
      id: "triage",
      label: "Triage",
      status: "complete",
      detail: `Ranked ${args.selectedFire.name} #${args.selectedTriage.rank} with ${args.selectedTriage.priority} priority.`,
      evidence: args.selectedTriage.rationale,
    },
    {
      id: "resource-recommendation",
      label: "Resource recommendation",
      status: args.selectedTriage.availableTeams > 0 ? "complete" : "blocked",
      detail:
        args.selectedTriage.availableTeams > 0
          ? `${args.selectedTriage.availableTeams} local team(s) available near ${args.selectedTriage.nearestStationName ?? "the incident"}.`
          : "No local teams are currently available for immediate assignment.",
      evidence: args.selectedTriage.nearestStationDistanceKm
        ? `${args.selectedTriage.nearestStationDistanceKm} km station distance`
        : undefined,
    },
    {
      id: "assignment-draft",
      label: "Assignment draft",
      status: dispatchAction ? "approval_required" : "blocked",
      detail: dispatchAction?.title ?? "Dispatch package needs operator review before a team can be assigned.",
      evidence: dispatchAction?.rationale,
    },
    {
      id: "route-safety",
      label: "Route and evacuation scan",
      status: routeCreated || evacuationCreated ? "complete" : "approval_required",
      detail:
        routeCreated || evacuationCreated
          ? "Autonomous scan prepared route or evacuation recommendations for map review."
          : "Route and evacuation context is staged for operator review.",
      evidence: `${countLabel(args.agentOps?.createdRouteUpdates.length ?? 0, "route update")} and ${countLabel(
        args.agentOps?.createdEvacuations.length ?? 0,
        "evacuation zone",
      )} created in this run.`,
    },
    {
      id: "operator-approval",
      label: "Operator approval",
      status: args.approvalItems.length ? "approval_required" : "complete",
      detail: args.approvalItems.length
        ? `${countLabel(args.approvalItems.length, "action")} queued for operator approval.`
        : "No approval-gated action is pending.",
      evidence: "Dispatches, alerts, route writes, and evacuation actions remain gated.",
    },
    {
      id: "status-tracking",
      label: "Status tracking",
      status: "running",
      detail: "Continue monitoring responder status, route changes, containment, and public alert readiness.",
      evidence: args.escalationNote,
    },
  ];
}

export function buildAutonomousMission(args: {
  fireState: FireStateSnapshot;
  responderStats: ResponderStatsSnapshot;
  routeOps: RouteOpsSnapshot;
  selectedFire: FireStateIncident;
  plan: Partial<OpusCommanderResponse>;
  agentOps?: AgentOpsSnapshot | null;
}): EvacuaAutonomousMission {
  const triage = buildIncidentTriage(args);
  const selectedTriage =
    triage.find((item) => item.incidentId === args.selectedFire.id) ??
    triage[0] ?? {
      rank: 1,
      incidentId: args.selectedFire.id,
      incidentName: args.selectedFire.name,
      priority: "monitor",
      riskLevel: args.selectedFire.risk_level,
      posture: postureForRisk(args.selectedFire),
      containment: args.selectedFire.containment,
      growthRate: args.selectedFire.growth_rate,
      riskScore: 0,
      availableTeams: args.responderStats.totals.available,
      routeAdvisoryCount: 0,
      evacuationZoneCount: 0,
      rationale: "Selected incident only.",
    };
  const approvals = approvalQueue(args.plan.recommendedActions);
  const escalationNote = buildEscalationNote({ triage, responderStats: args.responderStats });
  const dispatchWorkflow = buildDispatchWorkflow({
    selectedFire: args.selectedFire,
    selectedTriage,
    plan: args.plan,
    approvalItems: approvals,
    agentOps: args.agentOps,
    escalationNote,
  });
  const routeCount = relatedRoutes(args.routeOps, args.selectedFire).length;
  const evacCount = relatedEvacuations(args.routeOps, args.selectedFire).length;

  const tasks: EvacuaAgentTask[] = [
    {
      id: "command-prioritize",
      role: "command",
      status: "complete",
      title: "Set command priority",
      detail: `${selectedTriage.incidentName} is the active mission focus at #${selectedTriage.rank}.`,
      evidence: selectedTriage.rationale,
    },
    {
      id: "operations-assign",
      role: "operations",
      status: approvals.some((item) => item.type === "dispatch") ? "approval_required" : "complete",
      title: "Prepare dispatch assignment",
      detail:
        args.plan.recommendedActions?.find((action) => action.type === "dispatch")?.title ??
        "No dispatch action was produced for this run.",
      evidence: `${selectedTriage.availableTeams} available team(s) reported.`,
    },
    {
      id: "planning-iap",
      role: "planning",
      status: "complete",
      title: "Draft incident action plan",
      detail: args.plan.summary ?? "Incident plan synthesized from fire, responder, route, and alert context.",
      evidence: `${countLabel(triage.length, "incident")} triaged.`,
    },
    {
      id: "logistics-routes",
      role: "logistics",
      status: routeCount || args.agentOps?.createdRouteUpdates.length ? "complete" : "approval_required",
      title: "Check routes and staging",
      detail: routeCount
        ? `${countLabel(routeCount, "route advisory")} already attached to the incident.`
        : "Route review is queued before movement approval.",
      evidence: `${countLabel(args.agentOps?.createdRouteUpdates.length ?? 0, "route recommendation")} created by scan.`,
    },
    {
      id: "communications-alert",
      role: "communications",
      status: approvals.some((item) => item.type === "alert") ? "approval_required" : "complete",
      title: "Draft public alert",
      detail: args.plan.alertDraft ? "Alert language drafted and queued for review." : "No public alert draft available.",
      evidence: "Public alerts remain operator-approved.",
    },
    {
      id: "safety-boundary",
      role: "safety",
      status: "complete",
      title: "Hold safety gate",
      detail: "Autonomous work is limited to analysis, simulation, drafts, and recommendations.",
      evidence: `${countLabel(approvals.length, "approval item")} held for command review.`,
    },
  ];

  const icsArtifacts: EvacuaIcsArtifacts = {
    incidentBrief: `${args.selectedFire.name}: ${args.selectedFire.risk_level} risk, ${Math.round(
      args.selectedFire.containment,
    )}% containment, ${Math.round(args.selectedFire.growth_rate)} m/min growth.`,
    objectives: [
      "Protect life safety for responders and affected communities.",
      "Prioritize the highest-risk incident before assigning scarce resources.",
      "Validate ingress, evacuation buffers, and communications before movement.",
      "Keep public alerts and dispatch actions behind operator approval.",
    ],
    organization: [
      {
        role: "command",
        assignment: "Set objectives and approve operational actions.",
        output: selectedTriage.priority === "immediate" ? "Immediate-priority mission selected." : "Monitor posture maintained.",
      },
      {
        role: "operations",
        assignment: "Prepare initial attack or staging assignment.",
        output: args.plan.recommendedActions?.find((action) => action.type === "dispatch")?.title ?? "Dispatch review pending.",
      },
      {
        role: "planning",
        assignment: "Maintain incident status and action plan.",
        output: `${countLabel(triage.length, "incident")} ranked for the operational period.`,
      },
      {
        role: "logistics",
        assignment: "Confirm routes, stations, and available teams.",
        output: `${selectedTriage.availableTeams} available team(s), ${routeCount} active route advisory record(s).`,
      },
      {
        role: "communications",
        assignment: "Prepare public and internal messaging.",
        output: args.plan.alertDraft ? "Alert draft prepared." : "Alert copy not generated.",
      },
      {
        role: "safety",
        assignment: "Review action gates and responder exposure.",
        output: `${countLabel(evacCount, "evacuation zone")} attached; approvals required for live action.`,
      },
    ],
    communications: args.plan.alertDraft ?? "No public alert draft generated yet.",
    safetyMessage:
      "Demo agent may recommend and simulate actions, but dispatch, public alert, route, and evacuation actions require operator approval.",
    resourceSummary: `${args.responderStats.totals.available} available, ${args.responderStats.totals.dispatched} en route, ${args.responderStats.totals.active} on scene, ${args.responderStats.totals.total} total teams.`,
  };

  return {
    mode: "autonomous_operation",
    summary: `Autonomous mission triaged ${countLabel(triage.length, "incident")} and queued ${countLabel(
      approvals.length,
      "approval-gated action",
    )} for ${selectedTriage.incidentName}.`,
    selectedIncidentId: args.selectedFire.id,
    selectedIncidentName: args.selectedFire.name,
    triage,
    tasks,
    dispatchWorkflow,
    icsArtifacts,
    approvalQueue: approvals,
    escalationNote,
    spokenUpdate: `${selectedTriage.incidentName} is priority ${selectedTriage.rank}. I triaged ${triage.length} incident${triage.length === 1 ? "" : "s"}, prepared the dispatch workflow, and queued ${approvals.length} action${approvals.length === 1 ? "" : "s"} for approval.`,
  };
}
