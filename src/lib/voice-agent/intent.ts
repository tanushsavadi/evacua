import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  OPUS_COMMANDER_MODEL,
  extractJsonObject,
  type OpusCommanderAction,
} from "@/lib/opus-commander";
import {
  VoiceIntentSchema,
  type DashboardContext,
  type VoiceIntentClassification,
} from "@/lib/voice-agent/schemas";

const ActionHintSchema = z.enum(["dispatch", "alert", "route", "evacuation", "monitor", "brief", "mission"]);

const ModelClassificationSchema = z.object({
  intent: VoiceIntentSchema,
  confidence: z.number().min(0).max(1),
  incidentHint: z.string().optional(),
  actionHint: ActionHintSchema.optional(),
  relevant: z.boolean(),
  rationale: z.string().optional(),
});

const OPS_TERMS =
  /\b(evacua|wildfire|fire|incident|mission|scenario|triage|status|brief|commander|dispatch|responder|team|crew|resource|mutual aid|route|road|ingress|egress|evacuat|alert|warning|public|approval|approve|containment|wind|smoke|air quality|perimeter|staging|ics|action plan|plan|operations|logistics|planning|communications|safety|mission control|pine ridge|pinebridge|pioneer|redwood valley|red wood valley)\b/i;

const FOLLOW_UP_TERMS =
  /\b(this|that|it|them|current|selected|same one|do that|do it|go ahead|proceed|approve it|send it|why|what next|next step|what should i do|what should i approve)\b/i;

export function normalizeOperatorUtterance(value: string) {
  return value
    .replace(/\bPinebridge\b/gi, "Pine Ridge")
    .replace(/\bPioneer(?=\s+(?:autonomous\s+)?(?:fire\s+)?mission\b|\s+fire\b)/gi, "Pine Ridge")
    .replace(/\bPine Rich\b/gi, "Pine Ridge")
    .replace(/\bRed Wood Valley\b/gi, "Redwood Valley")
    .replace(/\s+/g, " ")
    .trim();
}

function extractIncidentHint(text: string) {
  if (/\bpine\s+ridge\b/i.test(text)) return "Pine Ridge";
  if (/\bredwood\s+valley\b/i.test(text)) return "Redwood Valley";
  const explicit = text.match(/\b(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:fire|incident|mission)\b/);
  return explicit?.[1];
}

function actionHintFor(text: string): OpusCommanderAction["type"] | "brief" | "mission" | undefined {
  if (/\bdispatch|send (?:a |the )?(?:team|crew|responder)|stage (?:a |the )?(?:team|crew)\b/i.test(text)) return "dispatch";
  if (/\balert|warning|notify|message|public\b/i.test(text)) return "alert";
  if (/\broute|road|ingress|egress|corridor|detour\b/i.test(text)) return "route";
  if (/\bevacuat|zone|shelter\b/i.test(text)) return "evacuation";
  if (/\bbrief|summary|status|report|situation\b/i.test(text)) return "brief";
  if (/\bmission|scenario|plan|triage|action plan|run\b/i.test(text)) return "mission";
  return undefined;
}

export function deterministicClassifyOperatorIntent(
  utterance: string,
  dashboardContext?: DashboardContext,
): VoiceIntentClassification {
  const text = normalizeOperatorUtterance(utterance);
  const hasActiveContext = Boolean(
    dashboardContext?.selectedIncidentId ||
      dashboardContext?.activeRunId ||
      dashboardContext?.activeRun ||
      dashboardContext?.activePlan ||
      dashboardContext?.pendingActionIds?.length,
  );
  const relevant = OPS_TERMS.test(text) || (hasActiveContext && FOLLOW_UP_TERMS.test(text));
  const incidentHint = extractIncidentHint(text);
  const actionHint = actionHintFor(text);

  if (/\b(as you can see|this shows|i'?m showing|for the demo|judge|audience|presentation)\b/i.test(text)) {
    return {
      intent: "demo_narration",
      confidence: 0.92,
      incidentHint,
      actionHint,
      relevant: true,
      rationale: "Operator appears to be narrating a demo.",
    };
  }

  if (
    /\b(cancel voice|stop voice|stop listening|end call|goodbye|hang up)\b/i.test(text) ||
    /^\s*(please\s+)?(cancel|stop|never\s?mind)(\s+(that|it|this|everything))?\s*[.!]?\s*$/i.test(text)
  ) {
    return {
      intent: "cancel",
      confidence: 0.95,
      incidentHint,
      actionHint,
      relevant: true,
    };
  }

  if (!relevant) {
    return {
      intent: "out_of_scope",
      confidence: 0.86,
      incidentHint,
      actionHint,
      relevant: false,
      rationale: "No wildfire operations context was detected.",
    };
  }

  if (/\b(why|explain|reason|rationale)\b/i.test(text)) {
    return { intent: "rationale", confidence: 0.86, incidentHint, actionHint, relevant: true };
  }

  if (/\b(what should i approve first|which should i approve first|next approval|approval queue|what approval|approve first)\b/i.test(text)) {
    return { intent: "approval_guidance", confidence: 0.9, incidentHint, actionHint, relevant: true };
  }

  if (/\b(approve|approved|go ahead|proceed|do it|do that|send it|dispatch it)\b/i.test(text)) {
    return { intent: "approval_request", confidence: 0.82, incidentHint, actionHint, relevant: true };
  }

  if (/\b(what('| i)?s next|what next|next step|next steps|what should i do|what do i do|how should i proceed|what now|do next)\b/i.test(text)) {
    return { intent: "next_step", confidence: 0.9, incidentHint, actionHint, relevant: true };
  }

  if (/\b(prepare|draft|build|create|queue)\b.*\b(alert|warning|message|public)\b|\balert preview\b/i.test(text)) {
    return { intent: "alert_prep", confidence: 0.88, incidentHint, actionHint: "alert", relevant: true };
  }

  if (/\b(dispatch|send (?:a |the )?(?:team|crew|responder)|stage (?:a |the )?(?:team|crew)|mutual aid|resource note|resource notes)\b/i.test(text)) {
    return { intent: "dispatch_prep", confidence: 0.88, incidentHint, actionHint: "dispatch", relevant: true };
  }

  if (/\b(route|road|ingress|egress|corridor|detour)\b/i.test(text)) {
    return { intent: "route_review", confidence: 0.82, incidentHint, actionHint: "route", relevant: true };
  }

  if (/\bevacuat|zone|shelter\b/i.test(text)) {
    return { intent: "evacuation_review", confidence: 0.82, incidentHint, actionHint: "evacuation", relevant: true };
  }

  if (/\b(triage|prioriti[sz]e|rank)\b/i.test(text)) {
    return { intent: "incident_triage", confidence: 0.86, incidentHint, actionHint, relevant: true };
  }

  if (
    /\b(run|start|launch|begin)\b.*\b(mission|scenario|operation|plan)\b|\bautonomous\b.*\b(mission|scenario|operation)\b/i.test(text) ||
    /\b(build|create|generate|open)\b.*\b(action plan|incident action plan|command recommendation|recommendations|plan)\b/i.test(text) ||
    (hasActiveContext && /\b(start with this one|run this|run it|use this one)\b/i.test(text))
  ) {
    return { intent: "mission_start", confidence: 0.9, incidentHint, actionHint: "mission", relevant: true };
  }

  if (/\b(status|where are we|what happened|recap|summarize|summary|situation|brief|report|update|what changed|what matters|read.*plan)\b/i.test(text)) {
    return { intent: "status_brief", confidence: 0.84, incidentHint, actionHint, relevant: true };
  }

  if (/\b(fire|incident|evacua|mission control|commander)\b/i.test(text)) {
    return { intent: "status_brief", confidence: 0.68, incidentHint, actionHint, relevant: true };
  }

  return {
    intent: "unknown",
    confidence: 0.52,
    incidentHint,
    actionHint,
    relevant: true,
    rationale: "Relevant wording detected but intent is weak.",
  };
}

function shouldUseModelFallback(classification: VoiceIntentClassification) {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  if (process.env.EVACUA_VOICE_INTENT_MODEL === "always") return true;
  if (process.env.EVACUA_VOICE_INTENT_MODEL === "false") return false;
  return classification.confidence < 0.72 || classification.intent === "unknown";
}

async function classifyWithAnthropic(args: {
  utterance: string;
  dashboardContext?: DashboardContext;
  deterministic: VoiceIntentClassification;
}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: process.env.EVACUA_VOICE_INTENT_MODEL_NAME || OPUS_COMMANDER_MODEL,
    max_tokens: 360,
    stream: false,
    system: [
      "Classify a wildfire command-dashboard voice request.",
      "Return only JSON matching the requested schema.",
      "Relevant scope: wildfire operations, responder coordination, routes, alerts, evacuations, incident status, mission state, approvals, ICS-style briefs.",
      "Out-of-scope requests must not be routed to operational workflows.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          schema: {
            intent: VoiceIntentSchema.options.join(" | "),
            confidence: "0..1",
            incidentHint: "optional incident name",
            actionHint: "optional: dispatch | alert | route | evacuation | monitor | brief | mission",
            relevant: "boolean",
            rationale: "short reason",
          },
          utterance: args.utterance,
          dashboardContext: args.dashboardContext,
          deterministic: args.deterministic,
        }),
      },
    ],
  });
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const json = extractJsonObject(text);
  if (!json) return null;
  const parsed = ModelClassificationSchema.safeParse(JSON.parse(json));
  if (!parsed.success) return null;
  return parsed.data satisfies VoiceIntentClassification;
}

export async function classifyOperatorIntent(args: {
  utterance: string;
  dashboardContext?: DashboardContext;
}) {
  const deterministic = deterministicClassifyOperatorIntent(args.utterance, args.dashboardContext);
  if (!shouldUseModelFallback(deterministic)) {
    return { classification: deterministic, modelFallback: false };
  }

  try {
    const model = await classifyWithAnthropic({
      utterance: normalizeOperatorUtterance(args.utterance),
      dashboardContext: args.dashboardContext,
      deterministic,
    });
    if (!model) return { classification: deterministic, modelFallback: true };
    return {
      classification: {
        ...deterministic,
        ...model,
        incidentHint: model.incidentHint ?? deterministic.incidentHint,
        actionHint: model.actionHint ?? deterministic.actionHint,
      },
      modelFallback: true,
    };
  } catch (error) {
    console.warn(
      "Voice intent model fallback unavailable; using deterministic classification.",
      error instanceof Error ? error.message : "",
    );
    return { classification: deterministic, modelFallback: true };
  }
}
