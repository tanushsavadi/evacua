import type { OpusCommanderAction } from "@/lib/opus-commander";
import {
  createApprovalToken,
  createId,
  type PendingAction,
  type PendingActionStatus,
  type PendingClarification,
  type VoiceAgentResponse,
  type VoiceIntent,
  type VoiceRunEvent,
  type VoiceSession,
} from "@/lib/voice-agent/schemas";

type VoiceTurnRole = "user" | "assistant" | "system";

type VoiceTurnInput = {
  id?: string;
  sessionId: string;
  role: VoiceTurnRole;
  source: "vapi" | "dashboard" | "test" | "system";
  transcript: string;
  toolCallId?: string;
  transcriptTurnId?: string;
  clientRequestId?: string;
  metadata?: unknown;
};

type SupabaseError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

type PendingActionRow = {
  id: string;
  session_id: string;
  run_id?: string | null;
  incident_id?: string | null;
  incident_name?: string | null;
  action_id?: string | null;
  action_type: PendingAction["actionType"];
  title: string;
  rationale: string;
  payload?: unknown;
  status: PendingActionStatus;
  approval_token: string;
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
};

type PendingClarificationRow = {
  id: string;
  session_id: string;
  intent: VoiceIntent;
  question: string;
  missing_fields: PendingClarification["missingFields"];
  resume_payload: Record<string, unknown>;
  candidate_incidents?: PendingClarification["candidateIncidents"] | null;
  status: PendingClarification["status"];
  created_at: string;
  updated_at: string;
  expires_at: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const g = globalThis as typeof globalThis & {
  __evacuaVoiceStore?: {
    sessions: Map<string, VoiceSession>;
    turns: VoiceTurnInput[];
    events: VoiceRunEvent[];
    pendingActions: Map<string, PendingAction>;
    pendingClarifications: Map<string, PendingClarification>;
    callReports: Array<{ id: string; sessionId: string; vapiCallId?: string; report: unknown; createdAt: string }>;
    idempotency: Map<string, { response: VoiceAgentResponse; createdAt: number }>;
  };
};

function memory() {
  if (!g.__evacuaVoiceStore) {
    g.__evacuaVoiceStore = {
      sessions: new Map(),
      turns: [],
      events: [],
      pendingActions: new Map(),
      pendingClarifications: new Map(),
      callReports: [],
      idempotency: new Map(),
    };
  }
  return g.__evacuaVoiceStore;
}

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function endpoint(table: string, params?: Record<string, string | number | undefined | null>) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function supabaseRest<T>(
  table: string,
  params: Record<string, string | number | undefined | null> | undefined,
  init: RequestInit,
) {
  if (!hasSupabaseConfig()) throw new Error("Supabase voice-agent persistence is not configured.");
  const res = await fetch(endpoint(table, params), {
    ...init,
    headers: {
      apikey: SUPABASE_KEY!,
      authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as SupabaseError | null;
    throw new Error(payload?.message ?? `${table} request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function insertRows<T>(
  table: string,
  body: unknown,
  params?: Record<string, string | number | undefined | null>,
  upsert = false,
) {
  return supabaseRest<T[]>(table, { select: "*", ...params }, {
    method: "POST",
    headers: {
      prefer: `${upsert ? "resolution=merge-duplicates," : ""}return=representation`,
    },
    body: JSON.stringify(body),
  });
}

async function updateRows<T>(
  table: string,
  params: Record<string, string | number | undefined | null>,
  body: unknown,
) {
  return supabaseRest<T[]>(table, { select: "*", ...params }, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

async function selectRows<T>(
  table: string,
  params: Record<string, string | number | undefined | null>,
) {
  return supabaseRest<T[]>(table, params, { method: "GET" });
}

function toPendingAction(row: PendingActionRow): PendingAction {
  return {
    id: row.id,
    sessionId: row.session_id,
    runId: row.run_id ?? undefined,
    incidentId: row.incident_id ?? undefined,
    incidentName: row.incident_name ?? undefined,
    actionId: row.action_id ?? undefined,
    actionType: row.action_type,
    title: row.title,
    rationale: row.rationale,
    payload: row.payload,
    status: row.status,
    approvalToken: row.approval_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at ?? undefined,
  };
}

function toPendingActionRow(action: PendingAction): PendingActionRow {
  return {
    id: action.id,
    session_id: action.sessionId,
    run_id: action.runId ?? null,
    incident_id: action.incidentId ?? null,
    incident_name: action.incidentName ?? null,
    action_id: action.actionId ?? null,
    action_type: action.actionType,
    title: action.title,
    rationale: action.rationale,
    payload: action.payload,
    status: action.status,
    approval_token: action.approvalToken,
    created_at: action.createdAt,
    updated_at: action.updatedAt,
    expires_at: action.expiresAt ?? null,
  };
}

function toPendingClarification(row: PendingClarificationRow): PendingClarification {
  return {
    id: row.id,
    sessionId: row.session_id,
    intent: row.intent,
    question: row.question,
    missingFields: row.missing_fields,
    resumePayload: row.resume_payload,
    candidateIncidents: row.candidate_incidents ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

function toPendingClarificationRow(item: PendingClarification): PendingClarificationRow {
  return {
    id: item.id,
    session_id: item.sessionId,
    intent: item.intent,
    question: item.question,
    missing_fields: item.missingFields,
    resume_payload: item.resumePayload,
    candidate_incidents: item.candidateIncidents ?? null,
    status: item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    expires_at: item.expiresAt,
  };
}

export function sessionIdForVoiceRequest(input: {
  callId?: string;
  dashboardSessionId?: string;
  clientRequestId?: string;
  source?: string;
}) {
  if (input.callId) return `vapi-${input.callId}`;
  if (input.dashboardSessionId) return `dashboard-${input.dashboardSessionId}`;
  if (input.clientRequestId) return `request-${input.clientRequestId}`;
  return `${input.source ?? "voice"}-default`;
}

export async function upsertVoiceSession(input: {
  id: string;
  vapiCallId?: string;
  dashboardSessionId?: string;
  status?: VoiceSession["status"];
  metadata?: unknown;
}) {
  const now = new Date().toISOString();
  const existing = memory().sessions.get(input.id);
  const session: VoiceSession = {
    id: input.id,
    vapiCallId: input.vapiCallId ?? existing?.vapiCallId,
    dashboardSessionId: input.dashboardSessionId ?? existing?.dashboardSessionId,
    status: input.status ?? existing?.status ?? "active",
    metadata: input.metadata ?? existing?.metadata,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  memory().sessions.set(session.id, session);

  try {
    await insertRows(
      "voice_sessions",
      {
        id: session.id,
        vapi_call_id: session.vapiCallId ?? null,
        dashboard_session_id: session.dashboardSessionId ?? null,
        status: session.status,
        metadata: session.metadata ?? null,
        created_at: session.createdAt,
        updated_at: session.updatedAt,
      },
      { on_conflict: "id" },
      true,
    );
  } catch {
    // Demo and local development intentionally keep voice-agent state in memory.
  }

  return session;
}

export async function saveVoiceTurn(input: VoiceTurnInput) {
  const turn = {
    ...input,
    id: input.id ?? createId("turn"),
  };
  memory().turns.push(turn);

  try {
    await insertRows("voice_turns", {
      id: turn.id,
      session_id: turn.sessionId,
      role: turn.role,
      source: turn.source,
      transcript: turn.transcript,
      tool_call_id: turn.toolCallId ?? null,
      transcript_turn_id: turn.transcriptTurnId ?? null,
      client_request_id: turn.clientRequestId ?? null,
      metadata: turn.metadata ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-blocking audit persistence.
  }

  return turn;
}

export async function saveVoiceRunEvent(event: Omit<VoiceRunEvent, "id" | "createdAt"> & Partial<Pick<VoiceRunEvent, "id" | "createdAt">>) {
  const complete: VoiceRunEvent = {
    id: event.id ?? createId("voice-event"),
    sessionId: event.sessionId,
    runId: event.runId,
    type: event.type,
    message: event.message,
    data: event.data,
    createdAt: event.createdAt ?? new Date().toISOString(),
  };
  memory().events.push(complete);

  try {
    await insertRows("voice_run_events", {
      id: complete.id,
      session_id: complete.sessionId,
      run_id: complete.runId ?? null,
      type: complete.type,
      message: complete.message,
      data: complete.data ?? null,
      created_at: complete.createdAt,
    });
  } catch {
    // Non-blocking audit persistence.
  }

  return complete;
}

export async function createPendingAction(input: {
  sessionId: string;
  runId?: string;
  incidentId?: string;
  incidentName?: string;
  actionId?: string;
  actionType: PendingAction["actionType"];
  title: string;
  rationale: string;
  payload?: unknown;
  expiresAt?: string;
}) {
  const now = new Date().toISOString();
  const action: PendingAction = {
    id: createId("pending-action"),
    sessionId: input.sessionId,
    runId: input.runId,
    incidentId: input.incidentId,
    incidentName: input.incidentName,
    actionId: input.actionId,
    actionType: input.actionType,
    title: input.title,
    rationale: input.rationale,
    payload: input.payload,
    status: "queued_for_operator",
    approvalToken: createApprovalToken(),
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  memory().pendingActions.set(action.id, action);

  try {
    await insertRows<PendingActionRow>("pending_actions", toPendingActionRow(action));
  } catch {
    // Non-blocking audit persistence.
  }

  return action;
}

function isOperationalAction(action: OpusCommanderAction) {
  return action.requiresApproval || action.type === "dispatch" || action.type === "alert" || action.type === "route" || action.type === "evacuation";
}

export async function createPendingActionsFromCommanderActions(input: {
  sessionId: string;
  runId?: string;
  incidentId?: string;
  incidentName?: string;
  actions: OpusCommanderAction[];
}) {
  const created: PendingAction[] = [];
  for (const action of input.actions.filter(isOperationalAction)) {
    created.push(
      await createPendingAction({
        sessionId: input.sessionId,
        runId: input.runId,
        incidentId: input.incidentId,
        incidentName: input.incidentName,
        actionId: action.id,
        actionType: action.type,
        title: action.title,
        rationale: action.rationale,
        payload: action.payload,
      }),
    );
  }
  return created;
}

export async function listPendingActions(sessionId?: string) {
  const local = [...memory().pendingActions.values()].filter((item) => {
    if (sessionId && item.sessionId !== sessionId) return false;
    return item.status === "queued_for_operator";
  });

  try {
    const rows = await selectRows<PendingActionRow>("pending_actions", {
      select: "*",
      status: "eq.queued_for_operator",
      session_id: sessionId ? `eq.${sessionId}` : undefined,
      order: "created_at.desc",
      limit: 50,
    });
    return rows.map(toPendingAction);
  } catch {
    return local;
  }
}

export async function getPendingAction(id: string) {
  const local = memory().pendingActions.get(id) ?? null;
  try {
    const rows = await selectRows<PendingActionRow>("pending_actions", {
      select: "*",
      id: `eq.${id}`,
      limit: 1,
    });
    return rows[0] ? toPendingAction(rows[0]) : local;
  } catch {
    return local;
  }
}

export async function updatePendingActionStatus(id: string, status: PendingActionStatus) {
  const local = memory().pendingActions.get(id);
  const updatedAt = new Date().toISOString();
  if (local) {
    memory().pendingActions.set(id, {
      ...local,
      status,
      updatedAt,
    });
  }

  try {
    const rows = await updateRows<PendingActionRow>(
      "pending_actions",
      { id: `eq.${id}` },
      { status, updated_at: updatedAt },
    );
    return rows[0] ? toPendingAction(rows[0]) : memory().pendingActions.get(id) ?? null;
  } catch {
    return memory().pendingActions.get(id) ?? null;
  }
}

export async function validatePendingActionApproval(input: {
  pendingActionId?: string;
  approvalToken?: string;
  allowedTypes?: PendingAction["actionType"][];
}) {
  if (!input.pendingActionId || !input.approvalToken) {
    return { ok: false as const, error: "Missing pending action approval token." };
  }

  const action = await getPendingAction(input.pendingActionId);
  if (!action) return { ok: false as const, error: "Pending action was not found." };
  if (action.status !== "queued_for_operator" && action.status !== "approved") {
    return { ok: false as const, error: `Pending action is ${action.status}.` };
  }
  if (action.expiresAt && Date.parse(action.expiresAt) < Date.now()) {
    await updatePendingActionStatus(action.id, "expired");
    return { ok: false as const, error: "Pending action approval token expired." };
  }
  if (input.allowedTypes?.length && !input.allowedTypes.includes(action.actionType)) {
    return { ok: false as const, error: `Pending action type ${action.actionType} cannot approve this route.` };
  }
  if (action.approvalToken !== input.approvalToken) {
    return { ok: false as const, error: "Invalid pending action approval token." };
  }

  const approved = await updatePendingActionStatus(action.id, "approved");
  return { ok: true as const, action: approved ?? action };
}

export async function createPendingClarification(input: {
  sessionId: string;
  intent: VoiceIntent;
  question: string;
  missingFields: PendingClarification["missingFields"];
  resumePayload: Record<string, unknown>;
  candidateIncidents?: PendingClarification["candidateIncidents"];
}) {
  const now = new Date().toISOString();
  const item: PendingClarification = {
    id: createId("clarification"),
    sessionId: input.sessionId,
    intent: input.intent,
    question: input.question,
    missingFields: input.missingFields,
    resumePayload: input.resumePayload,
    candidateIncidents: input.candidateIncidents,
    status: "open",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
  memory().pendingClarifications.set(item.id, item);

  try {
    await insertRows<PendingClarificationRow>("pending_clarifications", toPendingClarificationRow(item));
  } catch {
    // Non-blocking audit persistence.
  }

  return item;
}

export async function getOpenPendingClarification(sessionId: string) {
  const local = [...memory().pendingClarifications.values()]
    .filter((item) => item.sessionId === sessionId && item.status === "open")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;

  if (local && Date.parse(local.expiresAt) < Date.now()) {
    await closePendingClarification(local.id, "expired");
    return null;
  }

  try {
    const rows = await selectRows<PendingClarificationRow>("pending_clarifications", {
      select: "*",
      session_id: `eq.${sessionId}`,
      status: "eq.open",
      order: "created_at.desc",
      limit: 1,
    });
    const item = rows[0] ? toPendingClarification(rows[0]) : local;
    if (item && Date.parse(item.expiresAt) < Date.now()) {
      await closePendingClarification(item.id, "expired");
      return null;
    }
    return item;
  } catch {
    return local;
  }
}

export async function closePendingClarification(id: string, status: PendingClarification["status"] = "answered") {
  const local = memory().pendingClarifications.get(id);
  const updatedAt = new Date().toISOString();
  if (local) {
    memory().pendingClarifications.set(id, {
      ...local,
      status,
      updatedAt,
    });
  }

  try {
    const rows = await updateRows<PendingClarificationRow>(
      "pending_clarifications",
      { id: `eq.${id}` },
      { status, updated_at: updatedAt },
    );
    return rows[0] ? toPendingClarification(rows[0]) : memory().pendingClarifications.get(id) ?? null;
  } catch {
    return memory().pendingClarifications.get(id) ?? null;
  }
}

export async function saveCallReport(input: {
  sessionId: string;
  vapiCallId?: string;
  report: unknown;
}) {
  const row = {
    id: createId("call-report"),
    sessionId: input.sessionId,
    vapiCallId: input.vapiCallId,
    report: input.report,
    createdAt: new Date().toISOString(),
  };
  memory().callReports.push(row);

  try {
    await insertRows("voice_call_reports", {
      id: row.id,
      session_id: row.sessionId,
      vapi_call_id: row.vapiCallId ?? null,
      report: row.report,
      created_at: row.createdAt,
    });
  } catch {
    // Non-blocking audit persistence.
  }

  return row;
}

export function getIdempotentResponse(key?: string) {
  if (!key) return null;
  const item = memory().idempotency.get(key);
  if (!item) return null;
  if (Date.now() - item.createdAt > 10 * 60_000) {
    memory().idempotency.delete(key);
    return null;
  }
  return item.response;
}

export function saveIdempotentResponse(key: string | undefined, response: VoiceAgentResponse) {
  if (!key) return response;
  memory().idempotency.set(key, { response, createdAt: Date.now() });
  return response;
}
