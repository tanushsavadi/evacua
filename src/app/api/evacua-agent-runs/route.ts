import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { POST as briefingPost } from "@/app/api/evacua-briefing/route";
import { POST as commanderPost } from "@/app/api/evacua-commander/route";
import { buildAutonomousMission, type EvacuaAutonomousMission } from "@/lib/ops/autonomous-agent-tools";
import { enqueueAgentMessage } from "@/lib/ops/agent-messages";
import {
  createRun,
  saveRun,
  type EvacuaAgentFinding,
  type EvacuaAgentRun,
  type EvacuaDigitalTwinReplay,
  type EvacuaSafetyReview,
} from "@/lib/ops/evacua-agent-runs";
import {
  buildFireStateFromSupabase,
  getResponderStats,
  listRecentRouteUpdates,
  analyzeFireAgent,
  type AgentOpsSnapshot,
  type FireStateIncident,
  type RouteOpsSnapshot,
} from "@/lib/ops/supabase-fire-ops";
import {
  buildCommanderContext,
  buildIncidentBriefMarkdown,
  extractJsonObject,
  OPUS_COMMANDER_MODEL,
  selectCommanderIncident,
  type OpusCommanderAction,
  type OpusCommanderContext,
  type OpusCommanderHandoff,
  type OpusCommanderResponse,
  type OpusCommanderTraceStep,
} from "@/lib/opus-commander";

export const runtime = "nodejs";

const AgentRunRequestSchema = z.object({
  incidentId: z.string().min(1).optional(),
  objective: z.string().min(1).max(1200).optional(),
  transcriptContext: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]).optional(),
        content: z.string().max(900).optional(),
      }),
    )
    .max(10)
    .optional(),
  suppressAgentMessage: z.boolean().optional(),
  emitProgressMessages: z.boolean().optional(),
  clientRequestId: z.string().min(1).max(120).optional(),
});

const FindingSchema = z.object({
  role: z.enum(["incident_analyst", "logistics_analyst", "comms_analyst", "safety_reviewer"]),
  title: z.string().min(1),
  detail: z.string().min(1),
  evidence: z.string().min(1),
  severity: z.enum(["watch", "elevated", "critical"]),
});

const SafetyReviewSchema = z.object({
  status: z.enum(["ready_for_operator_review", "needs_operator_review", "blocked"]),
  summary: z.string().min(1),
  flags: z.array(z.string().min(1)),
  approvalRequired: z.literal(true),
});

const RoleSynthesisSchema = z.object({
  findings: z.array(FindingSchema).min(4).max(8),
  safetyReview: SafetyReviewSchema.optional(),
});

type EvacuaBriefingPayload = {
  brief?: string;
  spokenBrief?: string;
  operatorChecklist?: string[];
  incidentBriefMarkdown?: string;
  toolTrace?: OpusCommanderTraceStep[];
};

function runId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `evacua-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function textFromMessage(message: Message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
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

function relevantRoutes(routeOps: RouteOpsSnapshot, fire: FireStateIncident) {
  return routeOps.routes.filter((route) => route.fire_id === fire.id || route.fire_name === fire.name);
}

function relevantEvacuations(routeOps: RouteOpsSnapshot, fire: FireStateIncident) {
  return routeOps.evacuations.filter((zone) => zone.fire_id === fire.id);
}

function actionNeedsApproval(action: OpusCommanderAction) {
  return action.type === "dispatch" || action.type === "alert" || action.type === "route" || action.type === "evacuation";
}

function fallbackSafetyReview(plan: Partial<OpusCommanderResponse>, context: OpusCommanderContext): EvacuaSafetyReview {
  const flags: string[] = [];
  const routes = relevantRoutes(context.routeOps, context.selectedFire);

  for (const action of plan.recommendedActions ?? []) {
    if (actionNeedsApproval(action) && !action.requiresApproval) {
      flags.push(`${action.title} must remain operator-approved.`);
    }
    if (action.type === "dispatch" && !action.payload) {
      flags.push("Dispatch recommendation is missing responder payload evidence.");
    }
  }

  if (!routes.length) {
    flags.push("Route evidence is limited; verify ingress before approving movement.");
  }

  const alertDraft = plan.alertDraft ?? context.alertDraft;
  if (!/official|evacua|alert|fire/i.test(alertDraft)) {
    flags.push("Alert language may be too vague for public use.");
  }

  return {
    status: flags.length ? "needs_operator_review" : "ready_for_operator_review",
    summary: flags.length
      ? "Run is useful for command review, but the flagged items must be checked before approval."
      : "Run is ready for operator review; all operational writes remain approval-gated.",
    flags: flags.length ? flags : ["No unsafe execution claims detected."],
    approvalRequired: true,
  };
}

function fallbackFindings(
  plan: Partial<OpusCommanderResponse>,
  context: OpusCommanderContext,
  safetyReview: EvacuaSafetyReview,
): EvacuaAgentFinding[] {
  const routes = relevantRoutes(context.routeOps, context.selectedFire);
  const evacuations = relevantEvacuations(context.routeOps, context.selectedFire);
  const dispatchAction = plan.recommendedActions?.find((action) => action.type === "dispatch");
  const alertAction = plan.recommendedActions?.find((action) => action.type === "alert");

  return [
    {
      role: "incident_analyst",
      title: "Incident posture",
      detail: `${context.selectedFire.name} is ${context.selectedFire.risk_level} with ${Math.round(
        context.selectedFire.containment,
      )}% containment and ${Math.round(context.selectedFire.growth_rate)} m/min growth.`,
      evidence: context.heuristicSummary,
      severity: context.riskLevel === "leave" ? "critical" : context.riskLevel === "prepare" ? "elevated" : "watch",
    },
    {
      role: "logistics_analyst",
      title: dispatchAction?.title ?? "Responder staging",
      detail:
        dispatchAction?.rationale ??
        `${context.responderStats.totals.available} teams are available for staging review.`,
      evidence: `${context.responderStats.totals.available} available, ${context.responderStats.totals.dispatched} en route, ${context.responderStats.totals.active} on scene.`,
      severity: context.responderStats.totals.available > 0 ? "elevated" : "critical",
    },
    {
      role: "comms_analyst",
      title: alertAction?.title ?? "Alert copy prepared",
      detail: "Public copy is prepared as a draft and must not be sent without operator approval.",
      evidence: `${evacuations.length} evacuation buffer record(s), ${routes.length} route advisory record(s).`,
      severity: context.riskLevel === "leave" ? "critical" : "elevated",
    },
    {
      role: "safety_reviewer",
      title: "Approval boundary",
      detail: safetyReview.summary,
      evidence: safetyReview.flags.join(" "),
      severity: safetyReview.status === "blocked" ? "critical" : "elevated",
    },
  ];
}

async function runHiddenRoleSynthesis(args: {
  context: OpusCommanderContext;
  briefing: EvacuaBriefingPayload;
  plan: Partial<OpusCommanderResponse>;
  safetyReview: EvacuaSafetyReview;
  transcriptContext?: Array<{ role?: "user" | "assistant"; content?: string }>;
}) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = (await client.messages.create({
      model: OPUS_COMMANDER_MODEL,
      max_tokens: 1400,
      stream: false,
      system: [
        "You are Evacua's hidden incident intelligence coordinator.",
        "Synthesize four role passes: incident analyst, logistics analyst, comms analyst, and safety reviewer.",
        "Return only valid JSON. Do not include model names, vendor names, or marketing labels.",
        "Do not claim emergency actions executed. Preserve explicit operator approval boundaries.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            outputSchema: {
              findings: [
                {
                  role: "incident_analyst | logistics_analyst | comms_analyst | safety_reviewer",
                  title: "short actionable title",
                  detail: "operator-useful finding with concrete metrics",
                  evidence: "source signal",
                  severity: "watch | elevated | critical",
                },
              ],
              safetyReview: {
                status: "ready_for_operator_review | needs_operator_review | blocked",
                summary: "short safety summary",
                flags: ["specific flag or clean check"],
                approvalRequired: true,
              },
            },
            incident: args.context.selectedFire,
            briefing: args.briefing,
            plan: args.plan,
            existingSafetyReview: args.safetyReview,
            transcriptContext: args.transcriptContext,
          }),
        },
      ],
    })) as Message;
    const json = extractJsonObject(textFromMessage(message));
    if (!json) return null;

    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      return null;
    }

    const parsed = RoleSynthesisSchema.safeParse(payload);
    return parsed?.success ? parsed.data : null;
  } catch (error) {
    console.warn(
      "Evacua role synthesis unavailable; using deterministic safety review.",
      error instanceof Error ? error.message : "",
    );
    return null;
  }
}

function digitalTwinReplay(
  plan: Partial<OpusCommanderResponse>,
  context: OpusCommanderContext,
): EvacuaDigitalTwinReplay {
  const routes = relevantRoutes(context.routeOps, context.selectedFire);
  const evacuations = relevantEvacuations(context.routeOps, context.selectedFire);
  const dispatchAction = plan.recommendedActions?.find((action) => action.type === "dispatch");
  const routeAction = plan.recommendedActions?.find((action) => action.type === "route");

  return {
    before: {
      posture: context.heuristicSummary,
      responderStaging: `${context.responderStats.totals.dispatched} team(s) already en route; ${context.responderStats.totals.available} available.`,
      routeConcern: routes[0]?.reason ?? "No route concern attached yet.",
      evacuationBuffer: `${evacuations.length} evacuation buffer record(s) attached.`,
      alertState: "No public alert sent by the planner.",
    },
    after: {
      posture: `${plan.riskLevel ?? context.riskLevel} posture with approval-gated next actions.`,
      responderStaging: dispatchAction?.title ?? "Responder staging unchanged.",
      routeConcern: routeAction?.rationale ?? routes[0]?.reason ?? "Route review remains required.",
      evacuationBuffer: evacuations.length
        ? `${evacuations.length} evacuation buffer record(s) highlighted on the map.`
        : "Evacuation buffer review requested before public action.",
      alertState: plan.alertDraft ? "Alert draft prepared for operator approval." : "Alert copy not generated.",
    },
  };
}

function buildIcs201Markdown(args: {
  context: OpusCommanderContext;
  plan: Partial<OpusCommanderResponse>;
  briefing: EvacuaBriefingPayload;
  safetyReview: EvacuaSafetyReview;
  handoffs: OpusCommanderHandoff[];
  autonomousMission?: EvacuaAutonomousMission;
}) {
  const base = args.plan.incidentBriefMarkdown ?? args.briefing.incidentBriefMarkdown ?? buildIncidentBriefMarkdown(args.context);
  return [
    base,
    "",
    "## ICS-201 Demo Addendum",
    `- Situation: ${args.plan.summary ?? args.briefing.brief ?? "Incident action plan prepared."}`,
    `- Objectives: keep responders staged, verify route integrity, and prepare public alert copy for approval.`,
    `- Assignments: ${args.handoffs.map((handoff) => `${handoff.role}: ${handoff.objective}`).join("; ") || "Command review pending."}`,
    `- Communications: alert draft remains queued until operator approval.`,
    `- Safety: ${args.safetyReview.summary}`,
    ...args.safetyReview.flags.map((flag) => `  - ${flag}`),
    ...(args.autonomousMission
      ? [
          "",
          "## Autonomous Dispatch Workflow",
          ...args.autonomousMission.dispatchWorkflow.map(
            (step) => `- ${step.label}: ${step.status.replaceAll("_", " ")} - ${step.detail}`,
          ),
          "",
          "## Operational Period Objectives",
          ...args.autonomousMission.icsArtifacts.objectives.map((objective) => `- ${objective}`),
        ]
      : []),
  ].join("\n");
}

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AgentRunRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid investigation request", details: parsed.error.flatten() }, { status: 400 });
  }

  const [fireState, responderStats] = await Promise.all([
    buildFireStateFromSupabase(),
    getResponderStats(),
  ]);
  let autonomousOps: AgentOpsSnapshot | null = null;
  try {
    autonomousOps = await analyzeFireAgent(fireState);
  } catch (error) {
    console.warn(
      "Autonomous route scan unavailable; continuing with existing route context.",
      error instanceof Error ? error.message : "",
    );
  }
  const routeOps = await listRecentRouteUpdates(60 * 60_000);
  const selectedFire = selectCommanderIncident(fireState.fires, parsed.data.incidentId);
  if (!selectedFire) {
    return NextResponse.json(
      { error: parsed.data.incidentId ? "Selected incident not found" : "No active fire incidents available" },
      { status: parsed.data.incidentId ? 404 : 409 },
    );
  }

  const objective =
    parsed.data.objective?.trim() ||
    `Build a safe operator-reviewed incident plan for ${selectedFire.name}.`;
  const run = createRun({
    runId: runId(),
    objective,
    incidentId: selectedFire.id,
    incidentName: selectedFire.name,
  });
  const emitProgress = (message: string, data?: Record<string, unknown>) => {
    if (!parsed.data.emitProgressMessages) return;
    enqueueAgentMessage({
      action: "scan",
      message,
      data: {
        runId: run.runId,
        incidentId: selectedFire.id,
        clientRequestId: parsed.data.clientRequestId,
        ...data,
      },
    });
  };

  try {
    const context = buildCommanderContext({
      fireState,
      responderStats,
      routeOps,
      selectedFire,
    });
    emitProgress(
      `${selectedFire.name} selected. Fire state, responder coverage, route history, and active evacuation context are loaded.`,
      { stage: "context_loaded" },
    );
    const briefingPromise = invokeRoute<EvacuaBriefingPayload>(briefingPost, "/api/evacua-briefing", {
      incidentId: selectedFire.id,
      operatorQuestion: objective,
      recentTranscript: parsed.data.transcriptContext,
      suppressAgentMessage: true,
    }).then((briefing) => {
      emitProgress("Incident briefing complete. I am merging risk, responder, route, and evacuation signals into the mission.", {
        stage: "briefing_complete",
      });
      return briefing;
    });
    const planPromise = invokeRoute<Partial<OpusCommanderResponse>>(commanderPost, "/api/evacua-commander", {
      incidentId: selectedFire.id,
      mode: "recommend",
      operatorIntent: objective,
      suppressAgentMessage: true,
    }).then((plan) => {
      emitProgress("Commander plan complete. I am checking recommended actions against safety and approval gates.", {
        stage: "commander_plan_complete",
      });
      return plan;
    });
    const [briefing, plan] = await Promise.all([
      briefingPromise,
      planPromise,
    ]);

    const deterministicSafety = fallbackSafetyReview(plan, context);
    emitProgress("Running role synthesis now: operations, planning, logistics, communications, and safety review.", {
      stage: "role_synthesis_started",
    });
    const roleSynthesis = await runHiddenRoleSynthesis({
      context,
      briefing,
      plan,
      safetyReview: deterministicSafety,
      transcriptContext: parsed.data.transcriptContext,
    });
    const safetyReview = roleSynthesis?.safetyReview ?? deterministicSafety;
    const handoffs = plan.agentHandoffs ?? [];
    const findings = roleSynthesis?.findings ?? fallbackFindings(plan, context, safetyReview);
    emitProgress("Safety review complete. I am assembling the dispatch workflow, approval queue, and Mission Control artifacts.", {
      stage: "safety_review_complete",
    });
    const autonomousMission = buildAutonomousMission({
      fireState,
      responderStats,
      routeOps,
      selectedFire,
      plan,
      agentOps: autonomousOps,
    });
    const trace: OpusCommanderTraceStep[] = [
      ...run.trace,
      {
        step: "Triaged active incidents",
        status: "complete",
        detail: autonomousMission.summary,
      },
      {
        step: "Ran autonomous route scan",
        status: autonomousOps ? "complete" : "skipped",
        detail: autonomousOps
          ? `${autonomousOps.findings.length} route or evacuation finding(s); ${autonomousOps.createdRouteUpdates.length} route update(s), ${autonomousOps.createdEvacuations.length} evacuation zone(s) prepared.`
          : "Autonomous route scan was unavailable; existing route state was used.",
      },
      ...(briefing.toolTrace ?? []),
      ...(plan.toolTrace ?? []),
      {
        step: "Synthesized role handoffs",
        status: "complete",
        detail: "Incident, logistics, communications, and safety reviewer passes were merged into one operator run.",
      },
      {
        step: "Prepared dispatch workflow",
        status: "complete",
        detail: autonomousMission.dispatchWorkflow.map((step) => `${step.label}: ${step.status}`).join("; "),
      },
      {
        step: "Safety-reviewed actions",
        status: safetyReview.status === "blocked" ? "failed" : "complete",
        detail: safetyReview.summary,
      },
    ];

    const completeRun: EvacuaAgentRun = {
      ...run,
      status: "complete",
      summary: plan.summary ?? briefing.brief ?? `${selectedFire.name} run complete.`,
      riskLevel: plan.riskLevel ?? context.riskLevel,
      incidentId: selectedFire.id,
      incidentName: selectedFire.name,
      findings,
      recommendedActions: plan.recommendedActions ?? [],
      trace,
      handoffs,
      safetyReview,
      digitalTwin: digitalTwinReplay(plan, context),
      autonomousMission,
      incidentTriage: autonomousMission.triage,
      tasks: autonomousMission.tasks,
      dispatchWorkflow: autonomousMission.dispatchWorkflow,
      icsArtifacts: autonomousMission.icsArtifacts,
      approvalQueue: autonomousMission.approvalQueue,
      alertDraft: plan.alertDraft ?? context.alertDraft,
      incidentBriefMarkdown: buildIcs201Markdown({
        context,
        plan,
        briefing,
        safetyReview,
        handoffs,
        autonomousMission,
      }),
    };

    saveRun(completeRun);
    if (!parsed.data.suppressAgentMessage) {
      enqueueAgentMessage({
        action: "scan",
        message: autonomousMission.spokenUpdate,
        data: {
          runId: completeRun.runId,
          incidentId: completeRun.incidentId,
          riskLevel: completeRun.riskLevel,
        },
      });
    }

    return NextResponse.json(completeRun);
  } catch (error) {
    const failedRun: EvacuaAgentRun = {
      ...run,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown investigation error",
      trace: [
        ...run.trace,
        {
          step: "Completed investigation run",
          status: "failed",
          detail: error instanceof Error ? error.message : "Unknown investigation error",
        },
      ],
    };
    saveRun(failedRun);
    return NextResponse.json({ error: failedRun.error, run: failedRun }, { status: 500 });
  }
}
