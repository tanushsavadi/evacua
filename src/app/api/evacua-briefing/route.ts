import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueAgentMessage } from "@/lib/ops/agent-messages";
import {
  buildFireStateFromSupabase,
  getResponderStats,
  listRecentRouteUpdates,
} from "@/lib/ops/supabase-fire-ops";
import {
  buildAgentHandoffs,
  buildCommanderContext,
  buildDecisionLedger,
  buildIncidentBriefMarkdown,
  OPUS_COMMANDER_MODEL,
  selectCommanderIncident,
  type OpusCommanderContext,
  type OpusCommanderTraceStep,
} from "@/lib/opus-commander";

export const runtime = "nodejs";

const BriefingRequestSchema = z.object({
  incidentId: z.string().min(1).optional(),
  home: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  operatorQuestion: z.string().max(1000).optional(),
  recentTranscript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]).optional(),
        content: z.string().max(800).optional(),
      }),
    )
    .max(8)
    .optional(),
});

const BriefingOutputSchema = z.object({
  brief: z.string().min(1),
  spokenBrief: z.string().min(1),
  operatorChecklist: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  handoffs: z.array(
    z.object({
      role: z.enum(["planning", "logistics", "communications"]),
      objective: z.string().min(1),
      recommendation: z.string().min(1),
      evidence: z.string().min(1),
      approvalGate: z.string().min(1).optional(),
    }),
  ),
  decisionLedger: z.array(
    z.object({
      signal: z.string().min(1),
      assessment: z.string().min(1),
      decision: z.string().min(1),
    }),
  ),
  incidentBriefMarkdown: z.string().optional(),
});

type BriefingOutput = z.infer<typeof BriefingOutputSchema>;

const EVACUA_TOOLS: Tool[] = [
  {
    name: "inspect_fire_state",
    description: "Read the selected incident fire posture, spread, containment, and perimeter estimate.",
    input_schema: {
      type: "object",
      properties: {
        incidentId: { type: "string" },
      },
    },
  },
  {
    name: "check_responder_mesh",
    description: "Read responder availability and active responder assignments for the incident.",
    input_schema: {
      type: "object",
      properties: {
        incidentId: { type: "string" },
      },
    },
  },
  {
    name: "review_routes_and_zones",
    description: "Read route advisories and evacuation zones connected to the incident.",
    input_schema: {
      type: "object",
      properties: {
        incidentId: { type: "string" },
      },
    },
  },
  {
    name: "compile_alert_material",
    description: "Read the approval-gated public alert draft and incident brief material.",
    input_schema: {
      type: "object",
      properties: {
        incidentId: { type: "string" },
      },
    },
  },
];

function isToolUse(block: Message["content"][number]): block is ToolUseBlock {
  return block.type === "tool_use";
}

function extractText(message: Message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

function relevantRoutes(context: OpusCommanderContext) {
  return context.routeOps.routes.filter(
    (route) => route.fire_id === context.selectedFire.id || route.fire_name === context.selectedFire.name,
  );
}

function relevantEvacuations(context: OpusCommanderContext) {
  return context.routeOps.evacuations.filter((zone) => zone.fire_id === context.selectedFire.id);
}

function runLocalTool(tool: ToolUseBlock, context: OpusCommanderContext) {
  if (tool.name === "inspect_fire_state") {
    return {
      selectedFire: context.selectedFire,
      riskLevel: context.riskLevel,
      regionalFireCount: context.fireState.count.active_fires,
      heuristicSummary: context.heuristicSummary,
    };
  }

  if (tool.name === "check_responder_mesh") {
    return {
      totals: context.responderStats.totals,
      activeResponders: context.responderStats.activeResponders.filter(
        (responder) => responder.incidentId === context.selectedFire.id,
      ),
      stationStats: context.responderStats.stats,
    };
  }

  if (tool.name === "review_routes_and_zones") {
    return {
      routes: relevantRoutes(context),
      evacuations: relevantEvacuations(context),
      timestamp: context.routeOps.timestamp,
    };
  }

  if (tool.name === "compile_alert_material") {
    return {
      alertDraft: context.alertDraft,
      alertPayload: context.alertPayload,
      incidentBriefMarkdown: buildIncidentBriefMarkdown(context),
      handoffs: buildAgentHandoffs(context),
      decisionLedger: buildDecisionLedger(context),
    };
  }

  return {
    error: `Unknown tool: ${tool.name}`,
  };
}

function fallbackBriefing(context: OpusCommanderContext): BriefingOutput {
  const handoffs = buildAgentHandoffs(context);
  const decisionLedger = buildDecisionLedger(context);
  const routeCount = context.routeOps.routes.filter(
    (route) => route.fire_id === context.selectedFire.id || route.fire_name === context.selectedFire.name,
  ).length;
  const evacuationCount = context.routeOps.evacuations.filter((zone) => zone.fire_id === context.selectedFire.id).length;
  const minutesSinceUpdate = Math.max(
    0,
    Math.round((Date.now() - Date.parse(context.selectedFire.last_update)) / 60_000),
  );
  const routeLabel = routeCount === 1 ? "route advisory" : "route advisories";
  const evacuationLabel = evacuationCount === 1 ? "evacuation zone recommendation" : "evacuation zone recommendations";
  const riskPosture = context.riskLevel.toUpperCase();
  const brief = [
    `${context.selectedFire.name} is in ${riskPosture} posture after an update about ${minutesSinceUpdate} minute(s) ago.`,
    "No prior snapshot is available in this run, so treat this as current-state synthesis and watch the next refresh for true deltas.",
    `What matters: ${Math.round(context.selectedFire.containment)}% containment, ${Math.round(
      context.selectedFire.growth_rate,
    )} m/min growth, ${context.responderStats.totals.available} available teams, ${routeCount} ${routeLabel}, and ${evacuationCount} ${evacuationLabel}.`,
    "Next watch items: containment delta, route advisory changes, and whether the staged dispatch or alert needs operator approval.",
  ].join(" ");
  return {
    brief,
    spokenBrief: `${context.selectedFire.name} is ${context.riskLevel}. Watch containment, route changes, and whether dispatch or alert approval is needed next.`,
    operatorChecklist: [
      `Confirm ${context.selectedFire.name} still warrants ${riskPosture} posture before acting.`,
      routeCount > 0
        ? "Review attached route advisory language before approving responder movement."
        : "Validate ingress and evacuation corridors before approving responder movement.",
      `Use the alert draft only after confirming ${evacuationCount} ${evacuationLabel} and current posture language.`,
    ],
    confidence: 0.78,
    handoffs,
    decisionLedger,
    incidentBriefMarkdown: buildIncidentBriefMarkdown(context),
  };
}

async function runEvacuaToolLoop(args: {
  context: OpusCommanderContext;
  operatorQuestion?: string;
  recentTranscript?: Array<{ role?: "user" | "assistant"; content?: string }>;
}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: MessageParam[] = [
    {
      role: "user",
      content: JSON.stringify({
        directive:
          "You are Evacua's incident assistant. Use the available read-only tools before answering. Return only strict JSON matching the requested schema. Never claim dispatches, alerts, route writes, or evacuation-zone writes executed.",
        outputSchema: {
          brief: "string",
          spokenBrief: "string",
          operatorChecklist: ["string"],
          confidence: "number from 0 to 1",
          handoffs: [
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
        },
        selectedIncidentId: args.context.selectedFire.id,
        operatorQuestion: args.operatorQuestion,
        recentTranscript: args.recentTranscript,
      }),
    },
  ];
  const trace: OpusCommanderTraceStep[] = [];

  for (let i = 0; i < 5; i += 1) {
    const message = (await client.messages.create({
      model: OPUS_COMMANDER_MODEL,
      max_tokens: 1800,
      stream: false,
      tools: EVACUA_TOOLS,
      messages,
    })) as Message;

    const toolUses = message.content.filter(isToolUse);
    if (toolUses.length === 0) {
      return {
        text: extractText(message),
        trace,
      };
    }

    messages.push({
      role: "assistant",
      content: message.content,
    });

    const results: ToolResultBlockParam[] = toolUses.map((tool) => {
      const output = runLocalTool(tool, args.context);
      trace.push({
        step: `Evacua tool: ${tool.name.replaceAll("_", " ")}`,
        status: "complete",
        detail: "Read-only incident context returned to the assistant planner.",
      });
      return {
        type: "tool_result",
        tool_use_id: tool.id,
        content: JSON.stringify(output),
      };
    });

    messages.push({
      role: "user",
      content: results,
    });
  }

  return {
    text: "",
    trace,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BriefingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid briefing request",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const [fireState, responderStats, routeOps] = await Promise.all([
      buildFireStateFromSupabase(),
      getResponderStats(),
      listRecentRouteUpdates(60 * 60_000),
    ]);
    const selectedFire = selectCommanderIncident(fireState.fires, parsed.data.incidentId);
    if (!selectedFire) {
      return NextResponse.json(
        { error: parsed.data.incidentId ? "Selected incident not found" : "No active fire incidents available" },
        { status: parsed.data.incidentId ? 404 : 409 },
      );
    }

    const context = buildCommanderContext({
      fireState,
      responderStats,
      routeOps,
      selectedFire,
    });

    const trace: OpusCommanderTraceStep[] = [
      {
        step: "Selected incident context",
        status: "complete",
        detail: `${selectedFire.name} selected for assistant briefing.`,
      },
    ];

    let output = fallbackBriefing(context);
    if (process.env.ANTHROPIC_API_KEY) {
      const toolRun = await runEvacuaToolLoop({
        context,
        operatorQuestion: parsed.data.operatorQuestion,
        recentTranscript: parsed.data.recentTranscript,
      });
      trace.push(...toolRun.trace);
      const json = extractJsonObject(toolRun.text);
      let parsedJson: unknown = null;
      if (json) {
        try {
          parsedJson = JSON.parse(json);
        } catch {
          parsedJson = null;
        }
      }
      const modelOutput = parsedJson ? BriefingOutputSchema.safeParse(parsedJson) : null;
      if (modelOutput?.success) {
        output = {
          ...modelOutput.data,
          incidentBriefMarkdown: modelOutput.data.incidentBriefMarkdown ?? buildIncidentBriefMarkdown(context),
        };
      } else {
        trace.push({
          step: "Validated assistant synthesis",
          status: "complete",
          detail: "Assistant synthesis was normalized into Evacua's deterministic safety schema.",
        });
      }
    } else {
      trace.push({
        step: "Assistant synthesis",
        status: "skipped",
        detail: "Live synthesis unavailable; returned deterministic safe briefing.",
      });
    }

    enqueueAgentMessage({
      action: "scan",
      message: output.spokenBrief,
      data: {
        incidentId: selectedFire.id,
        confidence: output.confidence,
        checklist: output.operatorChecklist,
      },
    });

    return NextResponse.json({
      ...output,
      incidentId: selectedFire.id,
      incidentName: selectedFire.name,
      toolTrace: trace,
    });
  } catch (error) {
    console.error("Evacua briefing error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate Evacua briefing",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
