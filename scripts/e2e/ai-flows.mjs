// AI, voice-agent, and Vapi-webhook flow tests against a local server.
// Exercises the judge-demo sequence, every voice intent path, idempotency,
// clarification round-trips, and the Vapi tool-call webhook.
const BASE = process.env.EVACUA_TEST_BASE ?? "http://localhost:3100";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const LIVE_TYPES = new Set(["dispatch", "alert", "route", "evacuation"]);

console.log("=== A. Judge demo sequence (reset -> brief -> run -> fetch) ===");
{
  const reset = await req("POST", "/api/demo/reset");
  check("reset ok", reset.status === 200 && reset.json?.success);

  const brief = await req("POST", "/api/evacua-briefing", {
    incidentId: "demo-pine-ridge-fire",
    operatorQuestion: "Give me the Pine Ridge incident brief for the operational scenario.",
  });
  check("briefing 200", brief.status === 200);
  check("brief text", typeof brief.json?.brief === "string" && brief.json.brief.length > 50);
  check("spoken brief", typeof brief.json?.spokenBrief === "string");
  check("checklist >= 1", (brief.json?.operatorChecklist ?? []).length >= 1);
  check("live synthesis used (confidence != 0.78 fallback)", brief.json?.confidence !== 0.78, `confidence=${brief.json?.confidence}`);
  check("handoffs cover 3 roles", new Set((brief.json?.handoffs ?? []).map((h) => h.role)).size === 3);

  const run = await req("POST", "/api/evacua-agent-runs", {
    incidentId: "demo-pine-ridge-fire",
    objective: "Run the Pine Ridge operational action plan with approval-gated dispatch and alert preview.",
  });
  check("agent run 200 complete", run.status === 200 && run.json?.status === "complete");
  const actions = run.json?.recommendedActions ?? [];
  check("actions >= 4", actions.length >= 4, `got ${actions.length}`);
  check("ALL live actions approval-gated", actions.filter((a) => LIVE_TYPES.has(a.type)).every((a) => a.requiresApproval === true));
  check("safety review approvalRequired", run.json?.safetyReview?.approvalRequired === true);
  check("digital twin before/after", Boolean(run.json?.digitalTwin?.before?.posture && run.json?.digitalTwin?.after?.posture));
  check("trace >= 10 steps", (run.json?.trace ?? []).length >= 10, `got ${(run.json?.trace ?? []).length}`);
  check("ICS markdown present", (run.json?.incidentBriefMarkdown ?? "").includes("ICS-201"));
  check("alert draft present", (run.json?.alertDraft ?? "").includes("EVACUA"));
  check("no vendor/model leakage", !JSON.stringify(run.json).match(/anthropic|claude|opus-4/i), "response mentions vendor/model");

  const fetchRun = await req("GET", `/api/evacua-agent-runs/${run.json.runId}`);
  check("run retrievable by id", fetchRun.status === 200 && fetchRun.json?.runId === run.json.runId);
}

console.log("=== B. Voice agent: status brief intent ===");
{
  const r = await req("POST", "/api/voice-agent", {
    utterance: "give me a status brief on pine ridge",
    source: "dashboard",
  });
  check("brief mode", r.json?.mode === "brief", `got ${r.json?.mode}`);
  check("incident resolved from utterance", r.json?.incidentName === "Pine Ridge Fire");
  check("dashboardPatch selects incident", r.json?.dashboardPatch?.selectedIncidentId === "demo-pine-ridge-fire");
}

console.log("=== C. Voice agent: dispatch prep (approval-gated) ===");
{
  const r = await req("POST", "/api/voice-agent", {
    utterance: "prepare a dispatch for pine ridge",
    source: "dashboard",
    dashboardContext: { dashboardSessionId: "test-session-c" },
  });
  check("approval mode", r.json?.mode === "approval", `got ${r.json?.mode}`);
  check("pending action created", (r.json?.pendingActionIds ?? []).length === 1);
  check("spoken mentions approval", /approve/i.test(r.json?.spoken ?? ""));
  const patchAction = r.json?.dashboardPatch?.pendingActions?.[0];
  check("pending action typed dispatch", patchAction?.actionType === "dispatch");
}

console.log("=== D. Voice agent: incident clarification round-trip ===");
{
  const sessionCtx = { dashboardSessionId: "test-session-d" };
  const first = await req("POST", "/api/voice-agent", {
    utterance: "prepare an alert",
    source: "dashboard",
    dashboardContext: sessionCtx,
  });
  check("ambiguous incident -> clarification", first.json?.mode === "clarification", `got ${first.json?.mode}`);
  check("clarification question lists candidates", /pine ridge/i.test(first.json?.clarification?.question ?? ""));
  const second = await req("POST", "/api/voice-agent", {
    utterance: "pine ridge",
    source: "dashboard",
    dashboardContext: sessionCtx,
  });
  check("clarified -> approval mode", second.json?.mode === "approval", `got ${second.json?.mode}`);
  check("resumed with alert prep", second.json?.dashboardPatch?.pendingActions?.[0]?.actionType === "alert", `got ${second.json?.dashboardPatch?.pendingActions?.[0]?.actionType}`);
}

console.log("=== E. Voice agent: out-of-scope + cancel + idempotency ===");
{
  const oos = await req("POST", "/api/voice-agent", {
    utterance: "what's a good pasta recipe",
    source: "dashboard",
  });
  check("out of scope refused", oos.json?.mode === "out_of_scope", `got ${oos.json?.mode}`);

  const cancel = await req("POST", "/api/voice-agent", {
    utterance: "cancel that",
    source: "dashboard",
  });
  check("cancel handled", cancel.json?.mode === "cancelled", `got ${cancel.json?.mode}`);

  const cid = `idem-${Date.now()}`;
  const a = await req("POST", "/api/voice-agent", {
    utterance: "give me a status brief on pine ridge",
    source: "dashboard",
    clientRequestId: cid,
  });
  const b = await req("POST", "/api/voice-agent", {
    utterance: "give me a status brief on pine ridge",
    source: "dashboard",
    clientRequestId: cid,
  });
  check("idempotent replay identical", JSON.stringify(a.json) === JSON.stringify(b.json));
}

console.log("=== F. Vapi events webhook: tool-calls ===");
{
  const toolCall = await req("POST", "/api/vapi/events", {
    message: {
      type: "tool-calls",
      call: { id: "test-call-1" },
      toolCallList: [
        {
          id: "tc-1",
          name: "evacua_handle_operator_request",
          arguments: { utterance: "status brief for pine ridge" },
        },
      ],
    },
  });
  check("tool-call 200", toolCall.status === 200);
  const result = toolCall.json?.results?.[0];
  check("toolCallId echoed", result?.toolCallId === "tc-1");
  check("spoken result present", typeof result?.result === "string" ? result.result.length > 0 : typeof result?.result?.spoken === "string");
  check("no approvalToken leaked to Vapi", !JSON.stringify(toolCall.json).includes("approvalToken"));

  const unknownTool = await req("POST", "/api/vapi/events", {
    message: { type: "tool-calls", toolCallList: [{ id: "tc-2", name: "unknown_tool", arguments: {} }] },
  });
  check("unknown tool -> graceful", unknownTool.status === 200 && JSON.stringify(unknownTool.json).includes("Unsupported"));

  const transcript = await req("POST", "/api/vapi/events", {
    message: { type: "transcript", call: { id: "test-call-1" }, transcript: "test transcript", role: "user" },
  });
  check("transcript event accepted", transcript.status === 200 && transcript.json?.received === true);

  const unknown = await req("POST", "/api/vapi/events", { message: { type: "something-else" } });
  check("unknown event ignored gracefully", unknown.status === 200 && unknown.json?.ignored === "something-else");
}

console.log("=== G. Approval execution round-trip (pending action -> dispatch API) ===");
{
  await req("POST", "/api/demo/reset");
  const prep = await req("POST", "/api/voice-agent", {
    utterance: "prepare a dispatch for pine ridge",
    source: "dashboard",
    dashboardContext: { dashboardSessionId: "test-session-g" },
  });
  const pending = prep.json?.dashboardPatch?.pendingActions?.[0];
  check("pending dispatch staged", pending?.actionType === "dispatch");
  const payload = pending?.payload ?? {};
  const exec = await req("POST", "/api/dispatch-responder", {
    incidentId: payload.incidentId ?? "demo-pine-ridge-fire",
    incidentLat: payload.incidentLat ?? 37.2897,
    incidentLon: payload.incidentLon ?? -119.5272,
    pendingActionId: pending?.id,
    approvalToken: pending?.approvalToken,
  });
  check("approved dispatch executes", exec.status === 200 && exec.json?.success === true);
}

console.log("=== H. Commander full plan ===");
{
  const r = await req("POST", "/api/evacua-commander", {
    mode: "recommend",
    incidentId: "demo-pine-ridge-fire",
    operatorIntent: "what should we do about pine ridge",
  });
  check("commander 200", r.status === 200);
  check("model field stripped", !("model" in (r.json ?? {})));
  const live = (r.json?.recommendedActions ?? []).filter((a) => LIVE_TYPES.has(a.type));
  check("live actions gated", live.length > 0 && live.every((a) => a.requiresApproval));
  check("decision ledger present", (r.json?.decisionLedger ?? []).length >= 1);
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
