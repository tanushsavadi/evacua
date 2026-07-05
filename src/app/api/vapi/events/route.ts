import { NextResponse } from "next/server";
import { handleOperatorRequest } from "@/lib/voice-agent/handler";
import { sanitizeVapiToolResult, type DashboardContext } from "@/lib/voice-agent/schemas";
import {
  saveCallReport,
  saveVoiceTurn,
  sessionIdForVoiceRequest,
  upsertVoiceSession,
} from "@/lib/voice-agent/store";

export const runtime = "nodejs";

type VapiEvent = {
  message?: {
    type?: string;
    call?: {
      id?: string;
    };
    toolCallList?: unknown[];
    toolCalls?: unknown[];
    transcript?: string;
    role?: "user" | "assistant";
    transcriptType?: string;
    conversation?: unknown;
    status?: string;
    endedReason?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ToolCallShape = {
  id?: string;
  toolCallId?: string;
  name?: string;
  arguments?: unknown;
  parameters?: unknown;
  args?: unknown;
  function?: {
    name?: string;
    arguments?: unknown;
  };
};

function authorized(req: Request) {
  const token = process.env.EVACUA_VAPI_WEBHOOK_TOKEN;
  if (!token) return true;
  const authorization = req.headers.get("authorization") ?? "";
  const bearer = authorization.replace(/^Bearer\s+/i, "").trim();
  const custom = req.headers.get("x-vapi-secret") ?? req.headers.get("x-evacua-vapi-secret") ?? "";
  return bearer === token || custom === token;
}

function asToolCall(value: unknown): ToolCallShape {
  return value && typeof value === "object" ? (value as ToolCallShape) : {};
}

function toolCallId(toolCall: ToolCallShape) {
  return toolCall.id ?? toolCall.toolCallId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toolName(toolCall: ToolCallShape) {
  return toolCall.name ?? toolCall.function?.name;
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return { utterance: raw };
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function toolArguments(toolCall: ToolCallShape) {
  return parseToolArguments(toolCall.arguments ?? toolCall.parameters ?? toolCall.args ?? toolCall.function?.arguments);
}

function utteranceFromArguments(args: Record<string, unknown>) {
  const value =
    args.utterance ??
    args.request ??
    args.operatorRequest ??
    args.query ??
    args.transcript ??
    args.message ??
    args.input;
  return typeof value === "string" ? value : "";
}

function dashboardContextFromArguments(args: Record<string, unknown>) {
  const context = args.dashboardContext;
  return context && typeof context === "object" ? (context as DashboardContext) : undefined;
}

function scrubForVapi(value: unknown) {
  return JSON.parse(
    JSON.stringify(value, (key, nestedValue) => {
      if (key === "approvalToken") return undefined;
      return nestedValue;
    }),
  ) as unknown;
}

async function persistNonToolEvent(event: VapiEvent) {
  const message = event.message ?? {};
  const callId = message.call?.id;
  const sessionId = sessionIdForVoiceRequest({ callId, source: "vapi" });
  await upsertVoiceSession({
    id: sessionId,
    vapiCallId: callId,
    status: message.type === "end-of-call-report" ? "ended" : "active",
    metadata: {
      eventType: message.type,
      status: message.status,
      endedReason: message.endedReason,
    },
  });

  if (message.type === "transcript" && typeof message.transcript === "string" && message.transcript.trim()) {
    await saveVoiceTurn({
      sessionId,
      role: message.role ?? "user",
      source: "vapi",
      transcript: message.transcript,
      metadata: {
        transcriptType: message.transcriptType,
      },
    });
  }

  if (message.type === "conversation-update") {
    await saveVoiceTurn({
      sessionId,
      role: "system",
      source: "vapi",
      transcript: "conversation-update",
      metadata: message.conversation ?? message,
    });
  }

  if (message.type === "end-of-call-report") {
    await saveCallReport({
      sessionId,
      vapiCallId: callId,
      report: message,
    });
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: VapiEvent;
  try {
    body = (await req.json()) as VapiEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message ?? {};
  const eventType = message.type;

  if (eventType === "tool-calls") {
    const toolCalls = (message.toolCallList ?? message.toolCalls ?? []).map(asToolCall);
    const results = [];

    for (const toolCall of toolCalls) {
      const id = toolCallId(toolCall);
      if (toolName(toolCall) !== "evacua_handle_operator_request") {
        results.push({
          toolCallId: id,
          result: sanitizeVapiToolResult({
            spoken: "Unsupported Evacua tool call.",
            mode: "error",
          }),
        });
        continue;
      }

      const args = toolArguments(toolCall);
      const utterance = utteranceFromArguments(args);
      if (!utterance.trim()) {
        results.push({
          toolCallId: id,
          result: sanitizeVapiToolResult({
            spoken: "I need the operator request before I can act.",
            mode: "clarification",
          }),
        });
        continue;
      }

      try {
        const response = await handleOperatorRequest({
          utterance,
          source: "vapi",
          callId: message.call?.id,
          toolCallId: id,
          transcriptTurnId: typeof args.transcriptTurnId === "string" ? args.transcriptTurnId : undefined,
          clientRequestId: typeof args.clientRequestId === "string" ? args.clientRequestId : undefined,
          dashboardContext: dashboardContextFromArguments(args),
          recentTranscript: Array.isArray(args.recentTranscript) ? args.recentTranscript : undefined,
        });
        results.push({
          toolCallId: id,
          result: sanitizeVapiToolResult(scrubForVapi(response)),
        });
      } catch (error) {
        console.error("Vapi tool-call handling failed:", error);
        results.push({
          toolCallId: id,
          result: sanitizeVapiToolResult({
            spoken: "Evacua could not complete that request; check the dashboard state and try again.",
            mode: "error",
            warnings: [error instanceof Error ? error.message : "Unknown Vapi tool error."],
          }),
        });
      }
    }

    return NextResponse.json({ results });
  }

  if (
    eventType === "status-update" ||
    eventType === "transcript" ||
    eventType === "conversation-update" ||
    eventType === "end-of-call-report"
  ) {
    await persistNonToolEvent(body);
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true, ignored: eventType ?? "unknown" });
}
