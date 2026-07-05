import { z } from "zod";
import type { OpusCommanderAction } from "@/lib/opus-commander";
import type { EvacuaAgentRun } from "@/lib/ops/evacua-agent-runs";

export const VoiceIntentSchema = z.enum([
  "mission_start",
  "incident_triage",
  "status_brief",
  "next_step",
  "approval_guidance",
  "approval_request",
  "dispatch_prep",
  "alert_prep",
  "route_review",
  "evacuation_review",
  "rationale",
  "cancel",
  "demo_narration",
  "out_of_scope",
  "unknown",
]);

export type VoiceIntent = z.infer<typeof VoiceIntentSchema>;

export const ContextSufficiencySchema = z.enum([
  "ready",
  "ready_degraded",
  "needs_clarification",
  "out_of_scope",
  "blocked",
]);

export type ContextSufficiency = z.infer<typeof ContextSufficiencySchema>;

export const DashboardIncidentSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  risk: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  containment: z.number().nullable().optional(),
  last_update: z.string().optional(),
  description: z.string().nullable().optional(),
});

export const DashboardContextSchema = z.object({
  dashboardSessionId: z.string().optional(),
  selectedIncidentId: z.string().optional(),
  selectedIncidentName: z.string().nullable().optional(),
  visibleIncidents: z.array(DashboardIncidentSchema).max(50).optional(),
  activeRunId: z.string().optional(),
  activeRun: z.unknown().optional(),
  activePlan: z.unknown().optional(),
  activeBrief: z.unknown().optional(),
  dispatchMission: z.unknown().optional(),
  pendingActionIds: z.array(z.string()).max(25).optional(),
  routeAdvisoryCount: z.number().optional(),
  evacuationZoneCount: z.number().optional(),
  responderTotals: z
    .object({
      available: z.number().optional(),
      dispatched: z.number().optional(),
      active: z.number().optional(),
      total: z.number().optional(),
    })
    .optional(),
  timestamps: z
    .record(z.string(), z.string())
    .optional(),
});

export type DashboardContext = z.infer<typeof DashboardContextSchema>;

export const VoiceAgentRequestSchema = z.object({
  utterance: z.string().min(1).max(2000),
  source: z.enum(["vapi", "dashboard", "test"]).default("dashboard"),
  callId: z.string().optional(),
  toolCallId: z.string().optional(),
  transcriptTurnId: z.string().optional(),
  clientRequestId: z.string().optional(),
  dashboardContext: DashboardContextSchema.optional(),
  recentTranscript: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]).optional(),
        content: z.string().max(1000).optional(),
      }),
    )
    .max(12)
    .optional(),
});

export type VoiceAgentRequest = z.infer<typeof VoiceAgentRequestSchema>;

export type PendingActionStatus =
  | "queued_for_operator"
  | "approved"
  | "executed"
  | "rejected"
  | "expired";

export type PendingAction = {
  id: string;
  sessionId: string;
  runId?: string;
  incidentId?: string;
  incidentName?: string;
  actionId?: string;
  actionType: OpusCommanderAction["type"] | "brief" | "mission";
  title: string;
  rationale: string;
  payload?: unknown;
  status: PendingActionStatus;
  approvalToken: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type PendingClarification = {
  id: string;
  sessionId: string;
  intent: VoiceIntent;
  question: string;
  missingFields: Array<"incident" | "action" | "approval_target">;
  resumePayload: Record<string, unknown>;
  candidateIncidents?: Array<{ id: string; name: string }>;
  status: "open" | "answered" | "expired" | "cancelled";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type VoiceRunEvent = {
  id: string;
  sessionId: string;
  runId?: string;
  type:
    | "intent"
    | "context"
    | "clarification"
    | "brief"
    | "mission"
    | "pending_action"
    | "safety_block"
    | "out_of_scope"
    | "error";
  message: string;
  data?: unknown;
  createdAt: string;
};

export type VoiceSession = {
  id: string;
  vapiCallId?: string;
  dashboardSessionId?: string;
  status: "active" | "ended";
  createdAt: string;
  updatedAt: string;
  metadata?: unknown;
};

export type VoiceAgentResponse = {
  spoken: string;
  mode:
    | "brief"
    | "mission"
    | "triage"
    | "guidance"
    | "approval"
    | "clarification"
    | "out_of_scope"
    | "cancelled"
    | "error";
  runId?: string;
  incidentId?: string;
  incidentName?: string;
  pendingActionIds: string[];
  clarification?: {
    id: string;
    question: string;
    missingFields: PendingClarification["missingFields"];
  };
  contextStatus: ContextSufficiency;
  confidence: number;
  warnings: string[];
  dashboardPatch?: {
    selectedIncidentId?: string;
    plan?: unknown;
    brief?: unknown;
    run?: EvacuaAgentRun;
    pendingActions?: PendingAction[];
    trace?: unknown;
  };
};

export type VoiceIntentClassification = {
  intent: VoiceIntent;
  confidence: number;
  incidentHint?: string;
  actionHint?: OpusCommanderAction["type"] | "brief" | "mission";
  relevant: boolean;
  rationale?: string;
};

export function sanitizeVapiToolResult(value: unknown) {
  return JSON.stringify(value).replace(/\s+/g, " ").trim();
}

export function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createApprovalToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
}

export type VoiceAgentMetrics = {
  intent: VoiceIntent;
  confidence: number;
  contextStatus: ContextSufficiency;
  incidentId?: string;
  latencyMs: number;
  modelFallback: boolean;
  safetyBlocked: boolean;
};
