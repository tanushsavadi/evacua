import { z } from "zod";
import { buildAlertPayload, composeEmergencyAlertMessage } from "@/lib/alerts/compose";
import type {
  FireStateIncident,
  FireStateSnapshot,
  ResponderStatsSnapshot,
  RouteOpsSnapshot,
} from "@/lib/ops/supabase-fire-ops";
import { fireStateToEvents } from "@/lib/ops/supabase-fire-ops";

export const OPUS_COMMANDER_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

export const OpusCommanderRequestSchema = z.object({
  incidentId: z.string().min(1).optional(),
  home: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  mode: z.enum(["recommend", "execute-approved"]),
  operatorIntent: z.string().max(1200).optional(),
  suppressAgentMessage: z.boolean().optional(),
});

const ActionTypeSchema = z.enum(["dispatch", "alert", "route", "evacuation", "monitor"]);
const RiskLevelSchema = z.enum(["watch", "prepare", "leave"]);
const TraceStatusSchema = z.enum(["complete", "skipped", "failed"]);

const CommanderActionSchema = z.object({
  id: z.string().min(1),
  type: ActionTypeSchema,
  title: z.string().min(1),
  rationale: z.string().min(1),
  requiresApproval: z.boolean(),
  payload: z.unknown().optional(),
});

const CommanderTraceSchema = z.object({
  step: z.string().min(1),
  status: TraceStatusSchema,
  detail: z.string().min(1),
});

const CommanderHandoffSchema = z.object({
  role: z.enum(["planning", "logistics", "communications"]),
  objective: z.string().min(1),
  recommendation: z.string().min(1),
  evidence: z.string().min(1),
  approvalGate: z.string().min(1).optional(),
});

const CommanderLedgerSchema = z.object({
  signal: z.string().min(1),
  assessment: z.string().min(1),
  decision: z.string().min(1),
});

export const CommanderModelOutputSchema = z.object({
  summary: z.string().min(1),
  riskLevel: RiskLevelSchema,
  recommendedActions: z.array(CommanderActionSchema).min(1),
  alertDraft: z.string().optional(),
  toolTrace: z.array(CommanderTraceSchema).optional(),
  agentHandoffs: z.array(CommanderHandoffSchema).optional(),
  decisionLedger: z.array(CommanderLedgerSchema).optional(),
  incidentBriefMarkdown: z.string().optional(),
});

const CommanderPartialOutputSchema = z.object({
  summary: z.string().min(1).optional(),
  riskLevel: RiskLevelSchema.optional(),
  recommendedActions: z.array(CommanderActionSchema).optional(),
  alertDraft: z.string().optional(),
  toolTrace: z.array(CommanderTraceSchema).optional(),
  agentHandoffs: z.array(CommanderHandoffSchema).optional(),
  decisionLedger: z.array(CommanderLedgerSchema).optional(),
  incidentBriefMarkdown: z.string().optional(),
});

export type OpusCommanderRequest = z.infer<typeof OpusCommanderRequestSchema>;
export type OpusCommanderRiskLevel = z.infer<typeof RiskLevelSchema>;
export type OpusCommanderActionType = z.infer<typeof ActionTypeSchema>;
export type OpusCommanderAction = z.infer<typeof CommanderActionSchema>;
export type OpusCommanderTraceStep = z.infer<typeof CommanderTraceSchema>;
export type OpusCommanderHandoff = z.infer<typeof CommanderHandoffSchema>;
export type OpusCommanderLedgerEntry = z.infer<typeof CommanderLedgerSchema>;

export type OpusCommanderResponse = {
  runId: string;
  model: string;
  summary: string;
  riskLevel: OpusCommanderRiskLevel;
  recommendedActions: OpusCommanderAction[];
  alertDraft?: string;
  toolTrace: OpusCommanderTraceStep[];
  incidentId?: string;
  incidentName?: string;
  heuristicSummary?: string;
  agentHandoffs?: OpusCommanderHandoff[];
  decisionLedger?: OpusCommanderLedgerEntry[];
  incidentBriefMarkdown?: string;
};

export type OpusCommanderContext = {
  selectedFire: FireStateIncident;
  fireState: FireStateSnapshot;
  responderStats: ResponderStatsSnapshot;
  routeOps: RouteOpsSnapshot;
  alertDraft: string;
  alertPayload: unknown;
  heuristicSummary: string;
  riskLevel: OpusCommanderRiskLevel;
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

const riskWeight: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

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

function fireScore(fire: FireStateIncident) {
  return (
    (riskWeight[fire.risk_level] ?? 1) * 100 +
    Math.max(0, fire.growth_rate) +
    Math.max(0, 100 - fire.containment) / 2 +
    Math.max(0, fire.estimated_radius / 100)
  );
}

export function selectCommanderIncident(fires: FireStateIncident[], incidentId?: string) {
  if (incidentId) return fires.find((fire) => fire.id === incidentId) ?? null;
  return fires.slice().sort((a, b) => fireScore(b) - fireScore(a))[0] ?? null;
}

export function postureForFire(fire: FireStateIncident): OpusCommanderRiskLevel {
  if (fire.risk_level === "critical") return "leave";
  if (fire.risk_level === "high" || fire.growth_rate >= 35 || fire.containment < 25) return "prepare";
  return "watch";
}

function nearestStation(context: OpusCommanderContext) {
  const { selectedFire, fireState } = context;
  let best: (typeof fireState.firestations)[number] | null = null;
  let bestKm = Number.POSITIVE_INFINITY;

  for (const station of fireState.firestations) {
    const km = distanceKm(
      { lat: selectedFire.lat, lon: selectedFire.lon },
      { lat: station.lat, lon: station.lon },
    );
    if (km < bestKm) {
      best = station;
      bestKm = km;
    }
  }

  return best
    ? {
        station: best,
        distanceKm: bestKm,
      }
    : null;
}

function relevantRoutes(context: OpusCommanderContext) {
  return context.routeOps.routes.filter(
    (route) => route.fire_id === context.selectedFire.id || route.fire_name === context.selectedFire.name,
  );
}

function relevantEvacuations(context: OpusCommanderContext) {
  return context.routeOps.evacuations.filter((zone) => zone.fire_id === context.selectedFire.id);
}

export function buildHeuristicSummary(args: {
  fire: FireStateIncident;
  responderStats: ResponderStatsSnapshot;
  routeOps: RouteOpsSnapshot;
}) {
  const relatedRoutes = args.routeOps.routes.filter(
    (route) => route.fire_id === args.fire.id || route.fire_name === args.fire.name,
  );
  const relatedEvacs = args.routeOps.evacuations.filter((zone) => zone.fire_id === args.fire.id);
  return [
    `${args.fire.risk_level} fire posture with ${Math.round(args.fire.containment)}% containment`,
    `${Math.round(args.fire.growth_rate)} m/min growth signal`,
    `${args.responderStats.totals.available} available teams`,
    countLabel(relatedRoutes.length, "route advisory", "route advisories"),
    countLabel(relatedEvacs.length, "evacuation zone"),
  ].join(" | ");
}

export function buildCommanderContext(args: {
  fireState: FireStateSnapshot;
  responderStats: ResponderStatsSnapshot;
  routeOps: RouteOpsSnapshot;
  selectedFire: FireStateIncident;
}): OpusCommanderContext {
  const event = fireStateToEvents({
    ...args.fireState,
    fires: [args.selectedFire],
  })[0];
  const riskLevel = postureForFire(args.selectedFire);
  const routeSummary =
    args.routeOps.routes.find(
      (route) => route.fire_id === args.selectedFire.id || route.fire_name === args.selectedFire.name,
    )?.reason ?? "No active route advisory is attached to this incident yet.";
  const alertPayload = buildAlertPayload({
    event,
    posture: riskLevel,
    region: `${args.selectedFire.name} operations zone`,
    routeSummary,
  });

  return {
    selectedFire: args.selectedFire,
    fireState: args.fireState,
    responderStats: args.responderStats,
    routeOps: args.routeOps,
    alertDraft: composeEmergencyAlertMessage(alertPayload),
    alertPayload,
    heuristicSummary: buildHeuristicSummary({
      fire: args.selectedFire,
      responderStats: args.responderStats,
      routeOps: args.routeOps,
    }),
    riskLevel,
  };
}

export function buildToolTrace(
  context: OpusCommanderContext,
  extra: OpusCommanderTraceStep[] = [],
): OpusCommanderTraceStep[] {
  const relatedRoutes = relevantRoutes(context);
  const relatedEvacs = relevantEvacuations(context);

  return [
    {
      step: "Observed fire state",
      status: "complete",
      detail: `${context.selectedFire.name}: ${context.selectedFire.risk_level} risk, ${Math.round(
        context.selectedFire.containment,
      )}% containment, ${(context.selectedFire.estimated_radius / 1000).toFixed(1)} km estimated radius.`,
    },
    {
      step: "Checked responder mesh",
      status: "complete",
      detail: `${context.responderStats.totals.available} available, ${context.responderStats.totals.dispatched} en route, ${context.responderStats.totals.active} on scene.`,
    },
    {
      step: "Evaluated evacuation zone",
      status: "complete",
      detail: relatedEvacs.length
        ? `${countLabel(relatedEvacs.length, "active evacuation zone recommendation")} found.`
        : "No persisted evacuation zone is attached yet; commander keeps evacuation action approval-gated.",
    },
    {
      step: "Checked route advisories",
      status: relatedRoutes.length ? "complete" : "skipped",
      detail: relatedRoutes.length
        ? `${countLabel(relatedRoutes.length, "advisory record")} connected to this incident.`
        : "No current route advisory is attached to the selected incident.",
    },
    {
      step: "Drafted public alert",
      status: "complete",
      detail: "Alert copy generated from the existing AlertPayload schema.",
    },
    ...extra,
    {
      step: "Safety gate",
      status: "complete",
      detail: "Dispatch, route writes, evacuation zones, and public alerts require operator approval.",
    },
  ];
}

export function buildAgentHandoffs(context: OpusCommanderContext): OpusCommanderHandoff[] {
  const routeConcern = relevantRoutes(context)[0];
  const routeEvidence = routeConcern?.reason?.replace(/[.。]\s*$/, "") ?? "no current route advisory attached";
  const evacCount = relevantEvacuations(context).length;
  const available = context.responderStats.totals.available;

  return [
    {
      role: "planning",
      objective: "Set incident posture",
      recommendation:
        context.riskLevel === "leave"
          ? "Move to evacuation-ready posture and keep command review focused on the next three actions."
          : "Hold prepare posture while monitoring spread, containment, and route integrity.",
      evidence: `${context.selectedFire.risk_level} risk, ${Math.round(
        context.selectedFire.growth_rate,
      )} m/min growth, ${Math.round(context.selectedFire.containment)}% containment.`,
      approvalGate: "Operator confirms posture before public action.",
    },
    {
      role: "logistics",
      objective: "Stage responder movement",
      recommendation:
        available > 0
          ? "Prepare nearest-team dispatch package and review ingress before committing additional units."
          : "Hold dispatch recommendation and request resource availability refresh.",
      evidence: `${available} teams available; ${routeEvidence}.`,
      approvalGate: "Operator approves dispatch through responder workflow.",
    },
    {
      role: "communications",
      objective: "Prepare public and internal messaging",
      recommendation:
        context.riskLevel === "leave"
          ? "Queue evacuation-forward alert copy and keep route language explicit."
          : "Queue prepare posture copy and avoid over-escalating until route or spread signals change.",
      evidence: `${countLabel(evacCount, "evacuation zone recommendation")}; alert payload generated from incident state.`,
      approvalGate: "Operator sends alert through configured channels.",
    },
  ];
}

export function buildDecisionLedger(context: OpusCommanderContext): OpusCommanderLedgerEntry[] {
  const routeCount = relevantRoutes(context).length;
  const evacuationCount = relevantEvacuations(context).length;
  return [
    {
      signal: "Fire posture",
      assessment: `${context.selectedFire.risk_level} risk with ${Math.round(
        context.selectedFire.containment,
      )}% containment.`,
      decision: `Set operational risk to ${context.riskLevel}.`,
    },
    {
      signal: "Responder mesh",
      assessment: `${context.responderStats.totals.available} available, ${context.responderStats.totals.dispatched} en route, ${context.responderStats.totals.active} on scene.`,
      decision:
        context.responderStats.totals.available > 0
          ? "Recommend approval-gated dispatch package."
          : "Keep dispatch action locked until resources refresh.",
    },
    {
      signal: "Routes and zones",
      assessment: `${countLabel(routeCount, "active route advisory", "active route advisories")} and ${countLabel(
        evacuationCount,
        "evacuation zone",
      )} attached.`,
      decision: routeCount > 0 ? "Surface route advisory for review." : "Prompt route review before execution.",
    },
  ];
}

export function buildIncidentBriefMarkdown(context: OpusCommanderContext) {
  const handoffs = buildAgentHandoffs(context);
  return [
    `# Incident Brief: ${context.selectedFire.name}`,
    "",
    `- Posture: ${context.riskLevel.toUpperCase()}`,
    `- Risk: ${context.selectedFire.risk_level.toUpperCase()}`,
    `- Containment: ${Math.round(context.selectedFire.containment)}%`,
    `- Growth: ${Math.round(context.selectedFire.growth_rate)} m/min`,
    `- Estimated radius: ${(context.selectedFire.estimated_radius / 1000).toFixed(1)} km`,
    "",
    "## Immediate Actions",
    "- Validate route conditions before responder movement.",
    "- Keep dispatch and public alert actions approval-gated.",
    "- Monitor containment and perimeter growth before the next operational update.",
    "",
    "## Role Handoff",
    ...handoffs.map((handoff) => `- ${handoff.role}: ${handoff.recommendation}`),
    "",
    "## Public Alert Draft",
    "```",
    context.alertDraft,
    "```",
  ].join("\n");
}

export function buildFallbackPlan(args: {
  runId: string;
  model?: string;
  context: OpusCommanderContext;
  extraTrace?: OpusCommanderTraceStep[];
}): OpusCommanderResponse {
  const { context } = args;
  const nearest = nearestStation(context);
  const nearestIsDistant = Boolean(nearest && nearest.distanceKm > 120);
  const highUrgency = context.riskLevel === "leave" || context.selectedFire.risk_level === "critical";
  const routeConcern = relevantRoutes(context)[0];
  const agentHandoffs = buildAgentHandoffs(context);
  const decisionLedger = buildDecisionLedger(context);

  return {
    runId: args.runId,
    model: args.model ?? OPUS_COMMANDER_MODEL,
    incidentId: context.selectedFire.id,
    incidentName: context.selectedFire.name,
    summary: highUrgency
      ? `${context.selectedFire.name} needs immediate command attention: ${context.heuristicSummary}.`
      : `${context.selectedFire.name} should remain in monitored prepare posture: ${context.heuristicSummary}.`,
    riskLevel: context.riskLevel,
    heuristicSummary: context.heuristicSummary,
    alertDraft: context.alertDraft,
    agentHandoffs,
    decisionLedger,
    incidentBriefMarkdown: buildIncidentBriefMarkdown(context),
    recommendedActions: [
      {
        id: "dispatch-nearest-team",
        type: "dispatch",
        title: nearest
          ? nearestIsDistant
            ? `Stage mutual-aid team from ${nearest.station.name}`
            : `Dispatch nearest team from ${nearest.station.name}`
          : "Dispatch nearest available team",
        rationale: nearest
          ? nearestIsDistant
            ? `${nearest.station.name} is the closest known station, but it is ${nearest.distanceKm.toFixed(
                1,
              )} km away. Treat this as a mutual-aid staging decision and verify ingress before approval.`
            : `${nearest.station.name} is the closest known station at ${nearest.distanceKm.toFixed(
                1,
              )} km from the incident perimeter.`
          : "Responder availability should be validated before assigning a team.",
        requiresApproval: true,
        payload: {
          incidentId: context.selectedFire.id,
          incidentLat: context.selectedFire.lat,
          incidentLon: context.selectedFire.lon,
          nearestStation: nearest
            ? {
                id: nearest.station.id,
                name: nearest.station.name,
                distanceKm: Number(nearest.distanceKm.toFixed(1)),
              }
            : null,
        },
      },
      {
        id: "prepare-public-alert",
        type: "alert",
        title: "Prepare public alert",
        rationale: "The draft uses the existing emergency alert payload and stays queued until the operator sends it.",
        requiresApproval: true,
        payload: context.alertPayload,
      },
      {
        id: "review-route-advisory",
        type: "route",
        title: routeConcern ? "Review attached route advisory" : "Open route advisory review",
        rationale:
          routeConcern?.reason ??
          "No route advisory is attached yet; check ingress and evacuation corridors before dispatching more teams.",
        requiresApproval: true,
        payload: routeConcern ?? {
          incidentId: context.selectedFire.id,
          incidentName: context.selectedFire.name,
        },
      },
      {
        id: "monitor-fire-growth",
        type: "monitor",
        title: "Monitor spread and containment delta",
        rationale: `Growth signal is ${Math.round(
          context.selectedFire.growth_rate,
        )} m/min with ${Math.round(context.selectedFire.containment)}% containment.`,
        requiresApproval: false,
        payload: {
          incidentId: context.selectedFire.id,
          growthRate: context.selectedFire.growth_rate,
          containment: context.selectedFire.containment,
        },
      },
    ],
    toolTrace: buildToolTrace(context, args.extraTrace),
  };
}

export function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

export function mergeCommanderOutput(args: {
  runId: string;
  model: string;
  context: OpusCommanderContext;
  output: unknown;
}): OpusCommanderResponse | null {
  const parsed = CommanderModelOutputSchema.safeParse(args.output);
  if (!parsed.success) {
    const partial = CommanderPartialOutputSchema.safeParse(args.output);
    if (!partial.success) return null;
    const fallback = buildFallbackPlan({
      runId: args.runId,
      model: args.model,
      context: args.context,
      extraTrace: [
        {
          step: "Normalized planner response",
          status: "complete",
          detail: "Planner synthesis was merged into Evacua's safety schema before review.",
        },
      ],
    });
    const normalizedActions = partial.data.recommendedActions?.map((action) => ({
      ...action,
      requiresApproval: actionNeedsOperationalApproval(action.type) ? true : action.requiresApproval,
    }));
    return {
      ...fallback,
      summary: partial.data.summary ?? fallback.summary,
      riskLevel: partial.data.riskLevel ?? fallback.riskLevel,
      recommendedActions: normalizedActions?.length ? normalizedActions : fallback.recommendedActions,
      alertDraft: partial.data.alertDraft ?? fallback.alertDraft,
      agentHandoffs: partial.data.agentHandoffs ?? fallback.agentHandoffs,
      decisionLedger: partial.data.decisionLedger ?? fallback.decisionLedger,
      incidentBriefMarkdown: partial.data.incidentBriefMarkdown ?? fallback.incidentBriefMarkdown,
      toolTrace: buildToolTrace(args.context, [
        ...(partial.data.toolTrace ?? []),
        {
          step: "Normalized planner response",
          status: "complete",
          detail: "Planner synthesis was merged into Evacua's safety schema before review.",
        },
      ]),
    };
  }

  const modelActions = parsed.data.recommendedActions.map((action) => ({
    ...action,
    requiresApproval:
      actionNeedsOperationalApproval(action.type)
        ? true
        : action.requiresApproval,
  }));

  return {
    runId: args.runId,
    model: args.model,
    incidentId: args.context.selectedFire.id,
    incidentName: args.context.selectedFire.name,
    summary: parsed.data.summary,
    riskLevel: parsed.data.riskLevel,
    recommendedActions: modelActions,
    alertDraft: parsed.data.alertDraft ?? args.context.alertDraft,
    heuristicSummary: args.context.heuristicSummary,
    agentHandoffs: parsed.data.agentHandoffs ?? buildAgentHandoffs(args.context),
    decisionLedger: parsed.data.decisionLedger ?? buildDecisionLedger(args.context),
    incidentBriefMarkdown: parsed.data.incidentBriefMarkdown ?? buildIncidentBriefMarkdown(args.context),
    toolTrace: buildToolTrace(args.context, parsed.data.toolTrace ?? []),
  };
}

function actionNeedsOperationalApproval(actionType: OpusCommanderActionType) {
  return actionType === "dispatch" || actionType === "alert" || actionType === "route" || actionType === "evacuation";
}

export function buildCommanderPrompt(args: {
  context: OpusCommanderContext;
  mode: OpusCommanderRequest["mode"];
  operatorIntent?: string;
}) {
  const { context } = args;
  return {
    role: "Opus Incident Commander",
    directive:
      "Return only strict JSON. Build an auditable wildfire incident action plan for responders. Do not claim any dispatch, alert, route, or evacuation action was executed. Keep every operational write behind operator approval.",
    responseSchema: {
      summary: "string",
      riskLevel: "watch | prepare | leave",
      recommendedActions: [
        {
          id: "string",
          type: "dispatch | alert | route | evacuation | monitor",
          title: "string",
          rationale: "string",
          requiresApproval: "boolean",
          payload: "optional JSON object",
        },
      ],
      alertDraft: "string",
      agentHandoffs: [
        {
          role: "planning | logistics | communications",
          objective: "string",
          recommendation: "string",
          evidence: "string",
          approvalGate: "string",
        },
      ],
      decisionLedger: [
        {
          signal: "string",
          assessment: "string",
          decision: "string",
        },
      ],
      incidentBriefMarkdown: "string",
      toolTrace: [
        {
          step: "string",
          status: "complete | skipped | failed",
          detail: "string",
        },
      ],
    },
    operatorIntent: args.operatorIntent,
    mode: args.mode,
    selectedFire: context.selectedFire,
    regionalFireCount: context.fireState.count.active_fires,
    firestations: context.fireState.firestations,
    responderStats: context.responderStats,
    routeOps: context.routeOps,
    currentAlertDraft: context.alertDraft,
    heuristicBaseline: context.heuristicSummary,
  };
}
