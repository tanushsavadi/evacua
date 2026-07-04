import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { NextResponse } from "next/server";
import { enqueueAgentMessage } from "@/lib/ops/agent-messages";
import {
  buildFireStateFromSupabase,
  getResponderStats,
  listRecentRouteUpdates,
} from "@/lib/ops/supabase-fire-ops";
import {
  buildCommanderContext,
  buildCommanderPrompt,
  buildFallbackPlan,
  extractJsonObject,
  mergeCommanderOutput,
  OPUS_COMMANDER_MODEL,
  OpusCommanderRequestSchema,
  selectCommanderIncident,
  type OpusCommanderTraceStep,
} from "@/lib/opus-commander";

export const runtime = "nodejs";

function runId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evacua-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function textFromMessage(message: Message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function callOpus(args: {
  apiKey: string;
  model: string;
  prompt: unknown;
}) {
  const client = new Anthropic({ apiKey: args.apiKey });
  const message = await client.messages.create({
    model: args.model,
    max_tokens: 4096,
    stream: false,
    system: [
      "You are Evacua's internal strategic incident planner for wildfire responder operations.",
      "Return only a valid JSON object. No markdown, no code fences, no prose outside JSON.",
      "Recommendations may prepare dispatches, route advisories, evacuation buffers, and public alerts, but must not claim those actions executed.",
      "Every dispatch, public alert, route write, or evacuation-zone action must have requiresApproval=true.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: JSON.stringify(args.prompt),
      },
    ],
  });

  return textFromMessage(message as Message);
}

export async function POST(req: Request) {
  const id = runId();
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = OpusCommanderRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid commander request",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  const body = parsedBody.data;
  const model = OPUS_COMMANDER_MODEL;

  try {
    const [fireState, responderStats, routeOps] = await Promise.all([
      buildFireStateFromSupabase(),
      getResponderStats(),
      listRecentRouteUpdates(60 * 60_000),
    ]);

    const selectedFire = selectCommanderIncident(fireState.fires, body.incidentId);
    if (!selectedFire) {
      return NextResponse.json(
        {
          error: body.incidentId ? "Selected incident not found" : "No active fire incidents available",
        },
        { status: body.incidentId ? 404 : 409 },
      );
    }

    const context = buildCommanderContext({
      fireState,
      responderStats,
      routeOps,
      selectedFire,
    });
    const prompt = buildCommanderPrompt({
      context,
      mode: body.mode,
      operatorIntent: body.operatorIntent,
    });

    const modeTrace: OpusCommanderTraceStep[] =
      body.mode === "execute-approved"
        ? [
            {
              step: "Execute-approved boundary",
              status: "skipped",
              detail:
                "This endpoint only creates an incident plan; the UI calls dispatch and alert APIs after explicit operator approval.",
            },
          ]
        : [];

    if (!process.env.ANTHROPIC_API_KEY) {
      const fallback = buildFallbackPlan({
        runId: id,
        model,
        context,
        extraTrace: [
          ...modeTrace,
          {
            step: "Ran strategic planner",
            status: "skipped",
            detail: "Live strategic planner unavailable; returned deterministic commander plan for demo safety.",
          },
        ],
      });
      if (!body.suppressAgentMessage) {
        enqueueAgentMessage({
          action: "scan",
          message: `Evacua prepared an incident plan for ${selectedFire.name}. Review the approval-gated actions before dispatch or public alerting.`,
          data: {
            runId: fallback.runId,
            model: fallback.model,
            incidentId: fallback.incidentId,
            riskLevel: fallback.riskLevel,
          },
        });
      }
      return NextResponse.json(fallback);
    }

    try {
      const text = await callOpus({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model,
        prompt,
      });
      const json = extractJsonObject(text);
      let output: unknown = null;
      if (json) {
        try {
          output = JSON.parse(json);
        } catch {
          output = null;
        }
      }
      const plan = output
        ? mergeCommanderOutput({
            runId: id,
            model,
            context,
            output,
          })
        : null;

      if (plan) {
        if (!body.suppressAgentMessage) {
          enqueueAgentMessage({
            action: "scan",
            message: `Evacua incident plan ready for ${selectedFire.name}: ${plan.riskLevel}.`,
            data: {
              runId: plan.runId,
              model: plan.model,
              incidentId: plan.incidentId,
              riskLevel: plan.riskLevel,
            },
          });
        }
        return NextResponse.json(plan);
      }

      const fallback = buildFallbackPlan({
        runId: id,
        model,
        context,
        extraTrace: [
          ...modeTrace,
          {
            step: "Normalized planner response",
            status: "complete",
            detail: "Planner synthesis was normalized into Evacua's safe recommend-only schema.",
          },
        ],
      });
      return NextResponse.json(fallback);
    } catch (error) {
      console.error("Commander planner call failed:", error);
      const fallback = buildFallbackPlan({
        runId: id,
        model,
        context,
        extraTrace: [
          ...modeTrace,
          {
            step: "Ran strategic planner",
            status: "failed",
            detail:
              error instanceof Error
                ? `Strategic planner unavailable: ${error.message}`
                : "Strategic planner unavailable for an unknown reason.",
          },
        ],
      });
      return NextResponse.json(fallback);
    }
  } catch (error) {
    console.error("Commander API error:", error);
    return NextResponse.json(
      {
        error: "Failed to run commander",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
