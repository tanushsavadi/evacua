import { POST as agentRunsPost } from "@/app/api/evacua-agent-runs/route";
import { POST as briefingPost } from "@/app/api/evacua-briefing/route";
import {
  buildFireStateFromSupabase,
  getResponderStats,
  listRecentRouteUpdates,
  type FireStateIncident,
  type FireStateSnapshot,
  type ResponderStatsSnapshot,
  type RouteOpsSnapshot,
} from "@/lib/ops/supabase-fire-ops";
import type { EvacuaAgentRun } from "@/lib/ops/evacua-agent-runs";
import {
  buildCommanderContext,
  selectCommanderIncident,
  type OpusCommanderAction,
  type OpusCommanderResponse,
} from "@/lib/opus-commander";
import { classifyOperatorIntent, normalizeOperatorUtterance } from "@/lib/voice-agent/intent";
import {
  createId,
  type ContextSufficiency,
  type DashboardContext,
  type PendingAction,
  type VoiceAgentRequest,
  type VoiceAgentResponse,
  type VoiceIntent,
  VoiceAgentRequestSchema,
} from "@/lib/voice-agent/schemas";
import {
  closePendingClarification,
  createPendingAction,
  createPendingActionsFromCommanderActions,
  createPendingClarification,
  getIdempotentResponse,
  getOpenPendingClarification,
  listPendingActions,
  saveIdempotentResponse,
  saveVoiceRunEvent,
  saveVoiceTurn,
  sessionIdForVoiceRequest,
  upsertVoiceSession,
} from "@/lib/voice-agent/store";

type BriefingPayload = {
  brief?: string;
  spokenBrief?: string;
  operatorChecklist?: string[];
  incidentId?: string;
  incidentName?: string;
  incidentBriefMarkdown?: string;
  toolTrace?: unknown[];
};

type OpsState = {
  fireState: FireStateSnapshot;
  responderStats: ResponderStatsSnapshot;
  routeOps: RouteOpsSnapshot;
};

type ResolvedIncident = {
  fire: FireStateIncident | null;
  status: ContextSufficiency;
  source: "utterance" | "dashboard" | "active_run" | "backend" | "none";
  warnings: string[];
};

const LIVE_ACTION_TYPES = ["dispatch", "alert", "route", "evacuation"] satisfies Array<OpusCommanderAction["type"]>;

function isLiveActionType(type?: string): type is (typeof LIVE_ACTION_TYPES)[number] {
  return Boolean(type && LIVE_ACTION_TYPES.includes(type as (typeof LIVE_ACTION_TYPES)[number]));
}

function idempotencyKey(input: VoiceAgentRequest) {
  if (input.toolCallId) return `tool:${input.callId ?? "call"}:${input.toolCallId}`;
  if (input.clientRequestId) return `client:${input.clientRequestId}`;
  if (input.transcriptTurnId) return `turn:${input.callId ?? "call"}:${input.transcriptTurnId}`;
  return undefined;
}

async function invokeRoute<T>(
  handler: (req: Request) => Promise<Response> | Response,
  path: string,
  body: unknown,
): Promise<T> {
  const response = await handler(
    new Request(`http://evacua.local${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const payload = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? `${path} failed with ${response.status}`);
  }
  return payload;
}

function normalizeName(value?: string | null) {
  return normalizeOperatorUtterance(value ?? "")
    .toLowerCase()
    .replace(/\b(fire|wildfire|incident|mission)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function incidentMatches(value: string, fire: FireStateIncident) {
  const target = normalizeName(value);
  if (!target) return false;
  const name = normalizeName(fire.name);
  const id = normalizeName(fire.id);
  if (target === name || target === id || target.includes(name) || name.includes(target)) return true;
  const terms = name.split(" ").filter((term) => term.length > 2);
  return terms.length > 0 && terms.every((term) => target.includes(term));
}

function fireRiskScore(fire: FireStateIncident) {
  const riskWeight = { low: 1, medium: 2, high: 3, critical: 4 }[fire.risk_level] ?? 1;
  return riskWeight * 100 + fire.growth_rate + (100 - fire.containment) / 2 + fire.estimated_radius / 100;
}

function activeRunIncident(context?: DashboardContext) {
  const activeRun = context?.activeRun;
  if (!activeRun || typeof activeRun !== "object") return null;
  const value = activeRun as { incidentId?: unknown; incidentName?: unknown; runId?: unknown; status?: unknown };
  return {
    incidentId: typeof value.incidentId === "string" ? value.incidentId : undefined,
    incidentName: typeof value.incidentName === "string" ? value.incidentName : undefined,
    runId: typeof value.runId === "string" ? value.runId : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
  };
}

function extractPlan(context?: DashboardContext) {
  const activePlan = context?.activePlan;
  if (!activePlan || typeof activePlan !== "object") return null;
  const value = activePlan as Partial<OpusCommanderResponse>;
  if (!Array.isArray(value.recommendedActions)) return null;
  return value;
}

function extractRun(context?: DashboardContext) {
  const activeRun = context?.activeRun;
  if (!activeRun || typeof activeRun !== "object") return null;
  return activeRun as Partial<EvacuaAgentRun>;
}

function planFromRun(run?: Partial<EvacuaAgentRun> | null): Partial<OpusCommanderResponse> | null {
  if (!run?.recommendedActions?.length) return null;
  return {
    runId: run.runId,
    summary: run.summary,
    riskLevel: run.riskLevel,
    incidentId: run.incidentId,
    incidentName: run.incidentName,
    recommendedActions: run.recommendedActions,
    alertDraft: run.alertDraft,
    toolTrace: run.trace,
    agentHandoffs: run.handoffs,
    incidentBriefMarkdown: run.incidentBriefMarkdown,
  };
}

function needsSpecificIncident(intent: VoiceIntent) {
  return (
    intent === "dispatch_prep" ||
    intent === "alert_prep" ||
    intent === "route_review" ||
    intent === "evacuation_review" ||
    intent === "approval_request"
  );
}

function resolveIncident(args: {
  ops: OpsState;
  utterance: string;
  incidentHint?: string;
  intent: VoiceIntent;
  dashboardContext?: DashboardContext;
}): ResolvedIncident {
  const fires = args.ops.fireState.fires;
  if (!fires.length) {
    return {
      fire: null,
      status: "blocked",
      source: "none",
      warnings: ["No active fire incidents are available from the backend feed."],
    };
  }

  const explicitMatch = args.incidentHint
    ? fires.find((fire) => incidentMatches(args.incidentHint!, fire))
    : fires.find((fire) => incidentMatches(args.utterance, fire));
  if (explicitMatch) {
    return { fire: explicitMatch, status: "ready", source: "utterance", warnings: [] };
  }

  const selectedId = args.dashboardContext?.selectedIncidentId;
  if (selectedId) {
    const selected = fires.find((fire) => fire.id === selectedId);
    if (selected) return { fire: selected, status: "ready", source: "dashboard", warnings: [] };
  }

  const selectedName = args.dashboardContext?.selectedIncidentName;
  if (selectedName) {
    const selected = fires.find((fire) => incidentMatches(selectedName, fire));
    if (selected) return { fire: selected, status: "ready", source: "dashboard", warnings: [] };
  }

  const runIncident = activeRunIncident(args.dashboardContext);
  if (runIncident?.incidentId || runIncident?.incidentName) {
    const active =
      (runIncident.incidentId ? fires.find((fire) => fire.id === runIncident.incidentId) : undefined) ??
      (runIncident.incidentName ? fires.find((fire) => incidentMatches(runIncident.incidentName!, fire)) : undefined);
    if (active) return { fire: active, status: "ready", source: "active_run", warnings: [] };
  }

  if (needsSpecificIncident(args.intent) && fires.length > 1) {
    return {
      fire: null,
      status: "needs_clarification",
      source: "none",
      warnings: [],
    };
  }

  const selected = selectCommanderIncident(fires);
  return {
    fire: selected,
    status: "ready_degraded",
    source: "backend",
    warnings: selected ? [`No incident was specified, so I used highest-impact backend context: ${selected.name}.`] : [],
  };
}

function freshnessWarnings(ops: OpsState) {
  const warnings: string[] = [];
  const newestFireUpdate = Math.max(
    ...ops.fireState.fires
      .map((fire) => Date.parse(fire.last_update))
      .filter((value) => Number.isFinite(value)),
    0,
  );
  if (newestFireUpdate && Date.now() - newestFireUpdate > 15 * 60_000) {
    warnings.push("Fire state is older than 15 minutes.");
  }
  const routeStamp = Date.parse(ops.routeOps.timestamp);
  if (Number.isFinite(routeStamp) && Date.now() - routeStamp > 20 * 60_000) {
    warnings.push("Route advisory state is older than 20 minutes.");
  }
  if (ops.responderStats.totals.total === 0) {
    warnings.push("Responder totals are empty; resource guidance is degraded.");
  }
  return warnings;
}

async function askIncidentClarification(args: {
  sessionId: string;
  intent: VoiceIntent;
  utterance: string;
  ops: OpsState;
  warnings?: string[];
}) {
  const candidates = args.ops.fireState.fires
    .slice()
    .sort((a, b) => fireRiskScore(b) - fireRiskScore(a))
    .slice(0, 4)
    .map((fire) => ({ id: fire.id, name: fire.name }));
  const question =
    candidates.length > 1
      ? `Which incident should I use: ${candidates.map((item) => item.name).join(", ")}?`
      : "Which incident should I use?";
  const clarification = await createPendingClarification({
    sessionId: args.sessionId,
    intent: args.intent,
    question,
    missingFields: ["incident"],
    resumePayload: {
      utterance: args.utterance,
    },
    candidateIncidents: candidates,
  });
  return {
    spoken: question,
    mode: "clarification",
    pendingActionIds: [],
    clarification: {
      id: clarification.id,
      question,
      missingFields: clarification.missingFields,
    },
    contextStatus: "needs_clarification",
    confidence: 0.82,
    warnings: args.warnings ?? [],
  } satisfies VoiceAgentResponse;
}

async function askApprovalClarification(args: {
  sessionId: string;
  utterance: string;
  pendingActions: PendingAction[];
  warnings?: string[];
}) {
  const visible = args.pendingActions.slice(0, 4);
  const question =
    visible.length > 1
      ? `Which approval should I prepare: ${visible.map((item) => item.title).join(", ")}?`
      : "Which approval target should I use?";
  const clarification = await createPendingClarification({
    sessionId: args.sessionId,
    intent: "approval_request",
    question,
    missingFields: ["approval_target"],
    resumePayload: {
      utterance: args.utterance,
    },
  });
  return {
    spoken: question,
    mode: "clarification",
    pendingActionIds: [],
    clarification: {
      id: clarification.id,
      question,
      missingFields: clarification.missingFields,
    },
    contextStatus: "needs_clarification",
    confidence: 0.82,
    warnings: args.warnings ?? [],
  } satisfies VoiceAgentResponse;
}

function response(input: Omit<VoiceAgentResponse, "pendingActionIds" | "warnings"> & {
  pendingActionIds?: string[];
  warnings?: string[];
}): VoiceAgentResponse {
  return {
    pendingActionIds: input.pendingActionIds ?? [],
    warnings: input.warnings ?? [],
    ...input,
  };
}

function dashboardPatchForRun(run: EvacuaAgentRun, pendingActions: PendingAction[]) {
  const pendingByActionId = new Map(
    pendingActions
      .filter((action) => action.actionId)
      .map((action) => [action.actionId, action] as const),
  );
  const recommendedActions = run.recommendedActions.map((action) => {
    const pending = pendingByActionId.get(action.id);
    if (!pending) return action;
    const payload = action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
      ? action.payload
      : {};
    return {
      ...action,
      payload: {
        ...payload,
        pendingActionId: pending.id,
        approvalToken: pending.approvalToken,
      },
    };
  });
  const plan: OpusCommanderResponse = {
    runId: run.runId,
    model: "internal",
    summary: run.summary,
    riskLevel: run.riskLevel,
    recommendedActions,
    alertDraft: run.alertDraft,
    toolTrace: run.trace,
    incidentId: run.incidentId,
    incidentName: run.incidentName,
    heuristicSummary: run.digitalTwin?.before.posture,
    agentHandoffs: run.handoffs,
    incidentBriefMarkdown: run.incidentBriefMarkdown,
  };
  return {
    selectedIncidentId: run.incidentId,
    plan,
    run,
    pendingActions,
  };
}

function firstApprovalAction(plan?: Partial<OpusCommanderResponse> | null) {
  const actions = plan?.recommendedActions ?? [];
  return (
    actions.find((action) => action.type === "dispatch") ??
    actions.find((action) => action.type === "alert") ??
    actions.find((action) => action.requiresApproval) ??
    actions[0]
  );
}

function actionMatchesUtterance(action: PendingAction, utterance: string) {
  const text = normalizeName(utterance);
  const title = normalizeName(action.title);
  if (title && (text.includes(title) || title.includes(text))) return true;
  return (
    (action.actionType === "dispatch" && /\bdispatch|team|crew|responder\b/i.test(utterance)) ||
    (action.actionType === "alert" && /\balert|message|notify|warning|public\b/i.test(utterance)) ||
    (action.actionType === "route" && /\broute|road|ingress|egress\b/i.test(utterance)) ||
    (action.actionType === "evacuation" && /\bevacuat|zone|shelter\b/i.test(utterance))
  );
}

async function handleStatusBrief(args: {
  input: VoiceAgentRequest;
  sessionId: string;
  utterance: string;
  fire: FireStateIncident;
  warnings: string[];
}) {
  const brief = await invokeRoute<BriefingPayload>(briefingPost, "/api/evacua-briefing", {
    incidentId: args.fire.id,
    operatorQuestion: args.utterance,
    recentTranscript: args.input.recentTranscript,
    suppressAgentMessage: true,
  });
  return response({
    spoken: brief.spokenBrief ?? brief.brief ?? `${args.fire.name} brief is ready in the dashboard.`,
    mode: "brief",
    incidentId: args.fire.id,
    incidentName: args.fire.name,
    contextStatus: args.warnings.length ? "ready_degraded" : "ready",
    confidence: 0.88,
    warnings: args.warnings,
    dashboardPatch: {
      selectedIncidentId: args.fire.id,
      brief: {
        ...brief,
        incidentId: args.fire.id,
        incidentName: args.fire.name,
      },
    },
  });
}

async function handleMissionStart(args: {
  input: VoiceAgentRequest;
  sessionId: string;
  utterance: string;
  fire: FireStateIncident;
  warnings: string[];
  intent: VoiceIntent;
}) {
  const run = await invokeRoute<EvacuaAgentRun>(agentRunsPost, "/api/evacua-agent-runs", {
    incidentId: args.fire.id,
    objective: args.utterance || `Run an autonomous wildfire mission for ${args.fire.name}.`,
    transcriptContext: args.input.recentTranscript?.length
      ? args.input.recentTranscript
      : [{ role: "user", content: args.utterance }],
    suppressAgentMessage: true,
    emitProgressMessages: args.input.source === "dashboard",
    clientRequestId: args.input.clientRequestId ?? createId("voice-mission"),
  });
  const pendingActions = await createPendingActionsFromCommanderActions({
    sessionId: args.sessionId,
    runId: run.runId,
    incidentId: run.incidentId,
    incidentName: run.incidentName,
    actions: run.recommendedActions ?? [],
  });
  const pine = /pine ridge/i.test(args.fire.name);
  const redwood = /redwood valley/i.test(args.fire.name);
  const spoken = pine
    ? "Starting the Pine Ridge autonomous fire mission. I'll keep live actions approval-gated in the dashboard."
    : redwood
      ? "Starting the Redwood Valley autonomous fire mission. I'll keep live actions approval-gated in the dashboard."
      : "Starting that autonomous mission. I'll keep live actions approval-gated in the dashboard.";

  return response({
    spoken,
    mode: args.intent === "incident_triage" ? "triage" : "mission",
    runId: run.runId,
    incidentId: run.incidentId,
    incidentName: run.incidentName,
    pendingActionIds: pendingActions.map((action) => action.id),
    contextStatus: args.warnings.length ? "ready_degraded" : "ready",
    confidence: 0.92,
    warnings: args.warnings,
    dashboardPatch: dashboardPatchForRun(run, pendingActions),
  });
}

async function handleGuidance(args: {
  sessionId: string;
  utterance: string;
  intent: VoiceIntent;
  dashboardContext?: DashboardContext;
  warnings: string[];
}) {
  const plan = extractPlan(args.dashboardContext) ?? planFromRun(extractRun(args.dashboardContext));
  const pendingActions = await listPendingActions(args.sessionId);
  const firstPending =
    pendingActions.find((action) => action.actionType === "dispatch") ??
    pendingActions.find((action) => action.actionType === "alert") ??
    pendingActions[0];
  const firstPlanAction = firstApprovalAction(plan);

  if (args.intent === "rationale") {
    const action = firstPlanAction ?? firstPending;
    return response({
      spoken: action
        ? `${action.title} comes first because ${action.rationale}`
        : "I need an active mission before I can explain an approval recommendation.",
      mode: "guidance",
      pendingActionIds: firstPending ? [firstPending.id] : [],
      contextStatus: action ? "ready" : "ready_degraded",
      confidence: action ? 0.84 : 0.62,
      warnings: args.warnings,
    });
  }

  if (args.intent === "approval_guidance") {
    const action = firstPlanAction ?? firstPending;
    return response({
      spoken: action
        ? `Review ${action.title} first; it remains approval-gated in the dashboard.`
        : "No approval-gated action is queued yet. Run a mission first.",
      mode: "approval",
      pendingActionIds: firstPending ? [firstPending.id] : [],
      contextStatus: action ? "ready" : "ready_degraded",
      confidence: action ? 0.86 : 0.66,
      warnings: args.warnings,
    });
  }

  const mission = extractRun(args.dashboardContext)?.autonomousMission;
  const activeStep =
    mission?.dispatchWorkflow?.find((step) => step.status === "approval_required") ??
    mission?.dispatchWorkflow?.find((step) => step.status === "running") ??
    mission?.dispatchWorkflow?.at(-1);
  const action = firstPlanAction ?? firstPending;

  return response({
    spoken: action
      ? `Next, review ${action.title} in the dashboard before any live action executes.`
      : activeStep
        ? `Next, focus on ${activeStep.label}: ${activeStep.detail}`
        : "No active mission is available yet. Ask me to run a mission for the incident.",
    mode: "guidance",
    pendingActionIds: firstPending ? [firstPending.id] : [],
    contextStatus: action || activeStep ? "ready" : "ready_degraded",
    confidence: action || activeStep ? 0.84 : 0.62,
    warnings: args.warnings,
  });
}

async function handleApprovalRequest(args: {
  sessionId: string;
  utterance: string;
  warnings: string[];
}) {
  const pendingActions = await listPendingActions(args.sessionId);
  const matches = pendingActions.filter((action) => actionMatchesUtterance(action, args.utterance));
  const candidate = matches.length === 1 ? matches[0] : pendingActions.length === 1 ? pendingActions[0] : null;

  if (!candidate && pendingActions.length > 1) {
    return askApprovalClarification({
      sessionId: args.sessionId,
      utterance: args.utterance,
      pendingActions,
      warnings: args.warnings,
    });
  }

  return response({
    spoken: candidate
      ? `${candidate.title} is queued for dashboard approval; I will not execute it by voice.`
      : "No pending approval target is queued yet. Run or prepare the action first.",
    mode: "approval",
    pendingActionIds: candidate ? [candidate.id] : [],
    contextStatus: candidate ? "ready" : "ready_degraded",
    confidence: candidate ? 0.84 : 0.62,
    warnings: args.warnings,
    dashboardPatch: candidate
      ? {
          pendingActions: [candidate],
          selectedIncidentId: candidate.incidentId,
        }
      : undefined,
  });
}

async function handleActionPrep(args: {
  sessionId: string;
  intent: VoiceIntent;
  utterance: string;
  fire: FireStateIncident;
  ops: OpsState;
  warnings: string[];
}) {
  const context = buildCommanderContext({
    fireState: args.ops.fireState,
    responderStats: args.ops.responderStats,
    routeOps: args.ops.routeOps,
    selectedFire: args.fire,
  });
  const relatedRoutes = args.ops.routeOps.routes.filter(
    (route) => route.fire_id === args.fire.id || route.fire_name === args.fire.name,
  );
  const relatedEvacs = args.ops.routeOps.evacuations.filter((zone) => zone.fire_id === args.fire.id);

  const actionSpec =
    args.intent === "dispatch_prep"
      ? {
          actionType: "dispatch" as const,
          title: `Prepare responder dispatch for ${args.fire.name}`,
          rationale: `${args.ops.responderStats.totals.available} team(s) are available; operator approval is required before dispatch.`,
          payload: {
            incidentId: args.fire.id,
            incidentLat: args.fire.lat,
            incidentLon: args.fire.lon,
          },
          spoken: `Dispatch package is prepared for ${args.fire.name}; approve it in the dashboard before any team moves.`,
        }
      : args.intent === "alert_prep"
        ? {
            actionType: "alert" as const,
            title: `Prepare public alert for ${args.fire.name}`,
            rationale: "Alert copy is generated from current incident context and must be approved before sending.",
            payload: context.alertPayload,
            spoken: `Alert draft is prepared for ${args.fire.name}; approve it in the dashboard before any public message is sent.`,
          }
        : args.intent === "route_review"
          ? {
              actionType: "route" as const,
              title: `Review route advisory for ${args.fire.name}`,
              rationale:
                relatedRoutes[0]?.reason ??
                "Route and ingress context should be reviewed before responder movement.",
              payload: relatedRoutes[0] ?? { incidentId: args.fire.id, incidentName: args.fire.name },
              spoken: `Route review is staged for ${args.fire.name}; ${relatedRoutes.length} route advisory record(s) are available.`,
            }
          : {
              actionType: "evacuation" as const,
              title: `Review evacuation zone for ${args.fire.name}`,
              rationale:
                relatedEvacs[0]?.zone_name ??
                "Evacuation-zone recommendations must stay approval-gated before map writes.",
              payload: relatedEvacs[0] ?? { incidentId: args.fire.id, incidentName: args.fire.name },
              spoken: `Evacuation review is staged for ${args.fire.name}; ${relatedEvacs.length} zone record(s) are available.`,
            };

  const pendingAction = await createPendingAction({
    sessionId: args.sessionId,
    incidentId: args.fire.id,
    incidentName: args.fire.name,
    actionType: actionSpec.actionType,
    title: actionSpec.title,
    rationale: actionSpec.rationale,
    payload: actionSpec.payload,
  });

  return response({
    spoken: actionSpec.spoken,
    mode: "approval",
    incidentId: args.fire.id,
    incidentName: args.fire.name,
    pendingActionIds: [pendingAction.id],
    contextStatus: args.warnings.length ? "ready_degraded" : "ready",
    confidence: 0.86,
    warnings: args.warnings,
    dashboardPatch: {
      selectedIncidentId: args.fire.id,
      pendingActions: [pendingAction],
      brief:
        args.intent === "alert_prep"
          ? {
              incidentId: args.fire.id,
              incidentName: args.fire.name,
              brief: context.heuristicSummary,
              spokenBrief: actionSpec.spoken,
              incidentBriefMarkdown: context.alertDraft,
            }
          : undefined,
    },
  });
}

async function loadOpsState() {
  const [fireState, responderStats, routeOps] = await Promise.all([
    buildFireStateFromSupabase(),
    getResponderStats(),
    listRecentRouteUpdates(60 * 60_000),
  ]);
  return { fireState, responderStats, routeOps };
}

export async function handleOperatorRequest(rawInput: VoiceAgentRequest): Promise<VoiceAgentResponse> {
  const parsed = VoiceAgentRequestSchema.parse(rawInput);
  const startedAt = Date.now();
  const dashboardSessionId = parsed.dashboardContext?.dashboardSessionId;
  const sessionId = sessionIdForVoiceRequest({
    callId: parsed.callId,
    dashboardSessionId,
    clientRequestId: parsed.clientRequestId,
    source: parsed.source,
  });
  const dedupeKey = idempotencyKey(parsed);
  const cached = getIdempotentResponse(dedupeKey);
  if (cached) return cached;

  await upsertVoiceSession({
    id: sessionId,
    vapiCallId: parsed.callId,
    dashboardSessionId,
    status: "active",
    metadata: {
      source: parsed.source,
    },
  });

  let utterance = normalizeOperatorUtterance(parsed.utterance);
  await saveVoiceTurn({
    sessionId,
    role: "user",
    source: parsed.source,
    transcript: utterance,
    toolCallId: parsed.toolCallId,
    transcriptTurnId: parsed.transcriptTurnId,
    clientRequestId: parsed.clientRequestId,
  });

  const pendingClarification = await getOpenPendingClarification(sessionId);
  if (pendingClarification && !/\b(cancel|never mind|stop)\b/i.test(utterance)) {
    await closePendingClarification(pendingClarification.id, "answered");
    const previous = typeof pendingClarification.resumePayload.utterance === "string"
      ? pendingClarification.resumePayload.utterance
      : "";
    utterance = normalizeOperatorUtterance(`${previous} ${utterance}`.trim());
    await saveVoiceRunEvent({
      sessionId,
      type: "clarification",
      message: `Resumed ${pendingClarification.intent} after clarification.`,
      data: {
        clarificationId: pendingClarification.id,
        utterance,
      },
    });
  }

  let ops: OpsState;
  try {
    ops = await loadOpsState();
  } catch (error) {
    const result = response({
      spoken: "I cannot reach current Evacua operations state right now.",
      mode: "error",
      contextStatus: "blocked",
      confidence: 0.2,
      warnings: [error instanceof Error ? error.message : "Unknown ops-state error."],
    });
    saveIdempotentResponse(dedupeKey, result);
    return result;
  }

  const { classification, modelFallback } = await classifyOperatorIntent({
    utterance,
    dashboardContext: parsed.dashboardContext,
  });
  const baseWarnings = freshnessWarnings(ops);
  await saveVoiceRunEvent({
    sessionId,
    type: "intent",
    message: `${classification.intent} (${classification.confidence.toFixed(2)})`,
    data: {
      classification,
      modelFallback,
      latencyMs: Date.now() - startedAt,
    },
  });

  let result: VoiceAgentResponse;
  try {
    if (classification.intent === "out_of_scope") {
      result = response({
        spoken: "Evacua can only help with wildfire operations, responder coordination, routes, alerts, evacuations, and mission status.",
        mode: "out_of_scope",
        contextStatus: "out_of_scope",
        confidence: classification.confidence,
        warnings: [],
      });
      await saveVoiceRunEvent({
        sessionId,
        type: "out_of_scope",
        message: utterance,
      });
    } else if (classification.intent === "demo_narration") {
      result = response({
        spoken: "Understood.",
        mode: "brief",
        contextStatus: "ready",
        confidence: classification.confidence,
        warnings: [],
      });
    } else if (classification.intent === "cancel") {
      result = response({
        spoken: "Understood. Voice operations are cancelled.",
        mode: "cancelled",
        contextStatus: "ready",
        confidence: classification.confidence,
        warnings: [],
      });
    } else if (classification.intent === "next_step" || classification.intent === "approval_guidance" || classification.intent === "rationale") {
      result = await handleGuidance({
        sessionId,
        utterance,
        intent: classification.intent,
        dashboardContext: parsed.dashboardContext,
        warnings: baseWarnings,
      });
    } else if (classification.intent === "approval_request") {
      result = await handleApprovalRequest({
        sessionId,
        utterance,
        warnings: baseWarnings,
      });
    } else {
      const resolved = resolveIncident({
        ops,
        utterance,
        incidentHint: classification.incidentHint,
        intent: classification.intent,
        dashboardContext: parsed.dashboardContext,
      });
      const warnings = [...baseWarnings, ...resolved.warnings];
      await saveVoiceRunEvent({
        sessionId,
        type: "context",
        message: resolved.fire
          ? `${resolved.fire.name} selected from ${resolved.source}.`
          : `Incident resolution ${resolved.status}.`,
        data: {
          incidentId: resolved.fire?.id,
          contextStatus: resolved.status,
          source: resolved.source,
        },
      });

      if (resolved.status === "needs_clarification" || !resolved.fire) {
        result = await askIncidentClarification({
          sessionId,
          intent: classification.intent === "unknown" ? "status_brief" : classification.intent,
          utterance,
          ops,
          warnings,
        });
      } else if (classification.intent === "mission_start" || classification.intent === "incident_triage") {
        result = await handleMissionStart({
          input: parsed,
          sessionId,
          utterance,
          fire: resolved.fire,
          warnings,
          intent: classification.intent,
        });
      } else if (classification.intent === "dispatch_prep" || classification.intent === "alert_prep" || classification.intent === "route_review" || classification.intent === "evacuation_review") {
        result = await handleActionPrep({
          sessionId,
          intent: classification.intent,
          utterance,
          fire: resolved.fire,
          ops,
          warnings,
        });
      } else if (classification.intent === "unknown") {
        const clarification = await createPendingClarification({
          sessionId,
          intent: "unknown",
          question: "Do you want a status brief or an autonomous mission for the current incident?",
          missingFields: ["action"],
          resumePayload: { utterance },
        });
        result = response({
          spoken: clarification.question,
          mode: "clarification",
          clarification: {
            id: clarification.id,
            question: clarification.question,
            missingFields: clarification.missingFields,
          },
          contextStatus: "needs_clarification",
          confidence: 0.6,
          warnings,
        });
      } else {
        result = await handleStatusBrief({
          input: parsed,
          sessionId,
          utterance,
          fire: resolved.fire,
          warnings,
        });
      }
    }
  } catch (error) {
    console.error("Voice agent request failed:", error);
    result = response({
      spoken: "Evacua could not complete that request; check the dashboard state and try again.",
      mode: "error",
      contextStatus: "blocked",
      confidence: 0.2,
      warnings: [error instanceof Error ? error.message : "Unknown voice-agent error."],
    });
    await saveVoiceRunEvent({
      sessionId,
      type: "error",
      message: error instanceof Error ? error.message : "Unknown voice-agent error.",
      data: {
        utterance,
      },
    });
  }

  await saveVoiceTurn({
    sessionId,
    role: "assistant",
    source: "system",
    transcript: result.spoken,
    toolCallId: parsed.toolCallId,
    clientRequestId: parsed.clientRequestId,
    metadata: {
      mode: result.mode,
      contextStatus: result.contextStatus,
      confidence: result.confidence,
    },
  });
  await saveVoiceRunEvent({
    sessionId,
    runId: result.runId,
    type: isLiveActionType(result.mode) ? "safety_block" : result.mode === "approval" ? "pending_action" : "context",
    message: result.spoken,
    data: {
      mode: result.mode,
      pendingActionIds: result.pendingActionIds,
      latencyMs: Date.now() - startedAt,
    },
  });

  return saveIdempotentResponse(dedupeKey, result);
}
