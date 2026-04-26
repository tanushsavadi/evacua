import type {
  OpusCommanderAction,
  OpusCommanderHandoff,
  OpusCommanderRiskLevel,
  OpusCommanderTraceStep,
} from "@/lib/opus-commander";

export type EvacuaAgentFinding = {
  role: "incident_analyst" | "logistics_analyst" | "comms_analyst" | "safety_reviewer";
  title: string;
  detail: string;
  evidence: string;
  severity: "watch" | "elevated" | "critical";
};

export type EvacuaSafetyReview = {
  status: "ready_for_operator_review" | "needs_operator_review" | "blocked";
  summary: string;
  flags: string[];
  approvalRequired: true;
};

export type EvacuaDigitalTwinReplay = {
  before: {
    posture: string;
    responderStaging: string;
    routeConcern: string;
    evacuationBuffer: string;
    alertState: string;
  };
  after: {
    posture: string;
    responderStaging: string;
    routeConcern: string;
    evacuationBuffer: string;
    alertState: string;
  };
};

export type EvacuaAgentRun = {
  runId: string;
  status: "running" | "complete" | "failed";
  createdAt: string;
  updatedAt: string;
  objective: string;
  incidentId?: string;
  incidentName?: string;
  summary: string;
  riskLevel: OpusCommanderRiskLevel;
  findings: EvacuaAgentFinding[];
  recommendedActions: OpusCommanderAction[];
  trace: OpusCommanderTraceStep[];
  handoffs: OpusCommanderHandoff[];
  safetyReview: EvacuaSafetyReview;
  digitalTwin: EvacuaDigitalTwinReplay;
  alertDraft?: string;
  incidentBriefMarkdown?: string;
  error?: string;
};

const g = globalThis as typeof globalThis & {
  __evacuaAgentRuns?: Map<string, EvacuaAgentRun>;
};

function runStore() {
  if (!g.__evacuaAgentRuns) g.__evacuaAgentRuns = new Map<string, EvacuaAgentRun>();
  return g.__evacuaAgentRuns;
}

export function createRun(input: Pick<EvacuaAgentRun, "runId" | "objective" | "incidentId" | "incidentName">) {
  const now = new Date().toISOString();
  const run: EvacuaAgentRun = {
    ...input,
    status: "running",
    createdAt: now,
    updatedAt: now,
    summary: "Evacua intelligence run started.",
    riskLevel: "watch",
    findings: [],
    recommendedActions: [],
    trace: [
      {
        step: "Opened investigation run",
        status: "complete",
        detail: "Created a durable run log for briefing, planning, handoff, and safety review.",
      },
    ],
    handoffs: [],
    safetyReview: {
      status: "needs_operator_review",
      summary: "Safety review pending.",
      flags: ["Run still in progress."],
      approvalRequired: true,
    },
    digitalTwin: {
      before: {
        posture: "Pending",
        responderStaging: "Pending",
        routeConcern: "Pending",
        evacuationBuffer: "Pending",
        alertState: "Pending",
      },
      after: {
        posture: "Pending",
        responderStaging: "Pending",
        routeConcern: "Pending",
        evacuationBuffer: "Pending",
        alertState: "Pending",
      },
    },
  };
  runStore().set(run.runId, run);
  return run;
}

export function saveRun(run: EvacuaAgentRun) {
  run.updatedAt = new Date().toISOString();
  runStore().set(run.runId, run);
  return run;
}

export function getRun(runId: string) {
  return runStore().get(runId) ?? null;
}

export function resetAgentRuns() {
  runStore().clear();
}
