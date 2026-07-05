import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { extractJsonObject } from "@/lib/opus-commander";

export const runtime = "nodejs";

const SUGGESTIONS_MODEL =
  process.env.ANTHROPIC_SUGGESTIONS_MODEL ||
  "claude-sonnet-4-5";

const SuggestionToneSchema = z.enum(["cyan", "ember", "red", "muted"]);
const SuggestionIconSchema = z.enum(["brief", "plan", "alert", "watch", "dispatch", "route", "evacuation"]);

const RequestSchema = z.object({
  incident: z
    .object({
      id: z.string().optional(),
      name: z.string().nullable().optional(),
      risk: z.string().nullable().optional(),
      containment: z.number().nullable().optional(),
      description: z.string().nullable().optional(),
      last_update: z.string().optional(),
    })
    .nullable()
    .optional(),
  regionalContext: z
    .object({
      activeFireCount: z.number().optional(),
      responderAvailable: z.number().optional(),
      responderDispatched: z.number().optional(),
      responderActive: z.number().optional(),
      routeAdvisoryCount: z.number().optional(),
      evacuationZoneCount: z.number().optional(),
    })
    .optional(),
  brief: z
    .object({
      brief: z
        .string()
        .transform((value) => value.slice(0, 1600))
        .optional(),
      spokenBrief: z
        .string()
        .transform((value) => value.slice(0, 1000))
        .optional(),
      operatorChecklist: z
        .array(z.string().transform((value) => value.slice(0, 300)))
        .max(8)
        .optional(),
      incidentName: z.string().optional(),
    })
    .nullable()
    .optional(),
  recentTranscript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]).optional(),
        content: z
          .string()
          .transform((value) => value.slice(0, 500))
          .optional(),
      }),
    )
    .max(8)
    .optional(),
});

const SuggestionSchema = z.object({
  id: z.string().min(1).max(48),
  title: z.string().min(1).max(28),
  description: z.string().min(1).max(110),
  command: z.string().min(1).max(260),
  tone: SuggestionToneSchema,
  icon: SuggestionIconSchema,
});

const ResponseSchema = z.object({
  suggestions: z.array(SuggestionSchema).min(2).max(3),
});

type Suggestion = z.infer<typeof SuggestionSchema>;
type SuggestionRequest = z.infer<typeof RequestSchema>;

function textFromMessage(message: Message) {
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function incidentLabel(body: SuggestionRequest) {
  return body.incident?.name || body.brief?.incidentName || "the current incident";
}

function fallbackSuggestions(body: SuggestionRequest): Suggestion[] {
  const incidentName = incidentLabel(body);
  const risk = String(body.incident?.risk ?? "").toLowerCase();
  const containment = body.incident?.containment;
  const available = body.regionalContext?.responderAvailable ?? 0;
  const routeCount = body.regionalContext?.routeAdvisoryCount ?? 0;
  const evacuationCount = body.regionalContext?.evacuationZoneCount ?? 0;
  const highRisk = risk === "critical" || risk === "high" || (typeof containment === "number" && containment < 35);

  if (body.brief?.brief) {
    return [
      {
        id: "dynamic-plan-from-brief",
        title: highRisk ? "Plan response" : "Build next plan",
        description: `Turn the latest ${incidentName} brief into operator-reviewed next steps.`,
        command: `Create an approval-gated response plan for ${incidentName} using the latest brief and visible operations context.`,
        tone: highRisk ? "ember" : "cyan",
        icon: "plan",
      },
      {
        id: "dynamic-alert-review",
        title: highRisk || evacuationCount > 0 ? "Review alert" : "Draft guidance",
        description:
          evacuationCount > 0
            ? "Check public language against the active evacuation recommendation."
            : "Prepare public-facing guidance for review without sending it.",
        command: `Prepare alert guidance for ${incidentName}; do not send it. Include the current risk posture and any evacuation-zone context.`,
        tone: highRisk || evacuationCount > 0 ? "ember" : "muted",
        icon: "alert",
      },
      {
        id: "dynamic-watch-brief",
        title: routeCount > 0 ? "Check routes" : "Watch changes",
        description:
          routeCount > 0
            ? "Review route advisories before crews or residents move."
            : "Ask what changed and what needs attention next.",
        command: `What should I watch next for ${incidentName}? Include containment, responder, route, and alert readiness changes.`,
        tone: "muted",
        icon: routeCount > 0 ? "route" : "watch",
      },
    ];
  }

  return [
    {
      id: "dynamic-situation-brief",
      title: `${highRisk ? "Urgent" : "Situation"} brief`,
      description: `Summarize current risk, responders, routes, and next move for ${incidentName}.`,
      command: `Give me a concise status brief for ${incidentName}, including risk, containment, responder availability, route advisories, and next operator decision.`,
      tone: highRisk ? "ember" : "cyan",
      icon: "brief",
    },
    {
      id: "dynamic-action-plan",
      title: available > 0 ? "Plan response" : "Plan around teams",
      description:
        available > 0
          ? "Create approval-gated recommendations using available responder capacity."
          : "Plan next steps around limited responder availability.",
      command: `Create an incident action plan for ${incidentName} with approval-gated dispatch and alert recommendations based on current responder availability.`,
      tone: available > 0 ? "cyan" : "ember",
      icon: "plan",
    },
    {
      id: "dynamic-watch-next",
      title: routeCount > 0 ? "Review routes" : "Watch next",
      description:
        routeCount > 0
          ? "Check route advisories and evacuation-zone changes."
          : "Identify the next signal Evacua should monitor.",
      command: `What should I watch next for ${incidentName}? Prioritize containment movement, responder status, route advisories, and evacuation-zone changes.`,
      tone: "muted",
      icon: routeCount > 0 ? "route" : "watch",
    },
  ];
}

async function generateSuggestions(body: SuggestionRequest) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = (await client.messages.create({
    model: SUGGESTIONS_MODEL,
    max_tokens: 700,
    stream: false,
    system: [
      "You generate short, user-facing next-step suggestions for Evacua, a wildfire operations voice assistant.",
      "Return only valid JSON. No markdown, no code fences, no prose outside JSON.",
      "Suggestions must be contextual to the incident, brief, responder availability, routes, evacuation zones, and recent transcript.",
      "Do not suggest that dispatches, alerts, evacuations, or route writes have already executed.",
      "Use approval/review language for dispatch or public alert actions.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          outputSchema: {
            suggestions: [
              {
                id: "stable-kebab-case-string",
                title: "1-3 words, max 28 chars",
                description: "one helpful sentence, max 110 chars",
                command: "the exact command to send when clicked, max 260 chars",
                tone: "cyan | ember | red | muted",
                icon: "brief | plan | alert | watch | dispatch | route | evacuation",
              },
            ],
          },
          constraints: [
            "Return 2 or 3 suggestions.",
            "Make titles friendly, not internal.",
            "Commands should route naturally through the existing assistant: ask for a brief, plan, alert guidance, route review, evacuation review, or watch-next update.",
            "Avoid generic suggestions when incident context is present.",
          ],
          context: body,
        }),
      },
    ],
  })) as Message;

  const text = textFromMessage(message);
  const json = extractJsonObject(text);
  if (!json) return null;

  try {
    const parsed = ResponseSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data.suggestions : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid suggestion request",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const fallback = fallbackSuggestions(parsed.data);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      model: "local-context",
      source: "fallback",
      suggestions: fallback,
    });
  }

  try {
    const suggestions = await generateSuggestions(parsed.data);
    return NextResponse.json({
      model: suggestions ? SUGGESTIONS_MODEL : "local-context",
      source: suggestions ? "anthropic" : "fallback",
      suggestions: suggestions ?? fallback,
    });
  } catch (error) {
    console.error("Assistant suggestion generation failed:", error);
    return NextResponse.json({
      model: "local-context",
      source: "fallback",
      suggestions: fallback,
    });
  }
}
