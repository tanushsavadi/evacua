"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  Flame,
  Gauge,
  Loader2,
  MapPinned,
  MapPin,
  Mic,
  Play,
  Radio,
  RotateCcw,
  Route,
  Send,
  ShieldCheck,
  Siren,
  Sparkles,
  Thermometer,
  Truck,
  Volume2,
  Wind,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { MapPanel } from "@/components/command-center/map-panel";
import { OpsMetric, OpsShellHeader, OpsStatusPill } from "@/components/command-center/ops-shell-header";
import { useVapi, type VapiMessage } from "@/hooks/use-vapi";
import { useWeather, type WeatherData } from "@/hooks/use-weather";
import IncidentsList from "@/components/incidents-list";
import type { FireIncident } from "@/lib/schemas/incident";
import { useFireOps, type FireStateResponse, type ResponderStatsResponse } from "@/lib/hooks/use-fire-ops";
import type { LatLng } from "@/lib/geo/types";
import type {
  EvacuaAgentTask,
  EvacuaApprovalQueueItem,
  EvacuaAutonomousMission,
  EvacuaDispatchWorkflowStep,
  EvacuaIcsArtifacts,
  EvacuaIncidentTriageItem,
} from "@/lib/ops/autonomous-agent-tools";
import type {
  OpusCommanderAction,
  OpusCommanderActionType,
  OpusCommanderHandoff,
  OpusCommanderResponse,
  OpusCommanderRiskLevel,
  OpusCommanderTraceStep,
} from "@/lib/opus-commander";
import type { VoiceAgentResponse } from "@/lib/voice-agent/schemas";
import { cn } from "@/lib/utils";

function getHumidityColor(h: number) {
  return h < 20 ? "#e25656" : h < 30 ? "#ff9e3d" : h < 50 ? "#f5b041" : "#55b5d9";
}

function getTempColor(t: number) {
  return t >= 100 ? "#e25656" : t >= 90 ? "#ff9e3d" : t >= 80 ? "#f5b041" : "#55b5d9";
}

function getVisLabel(v: number) {
  return v < 1 ? "Poor" : v < 3 ? "Moderate" : v < 6 ? "Fair" : "Good";
}

function getVisColor(v: number) {
  return v < 1 ? "#e25656" : v < 3 ? "#ff9e3d" : v < 6 ? "#f5b041" : "#55b5d9";
}

function getAqiLabel(a: number) {
  return a >= 201
    ? "Very unhealthy"
    : a >= 151
      ? "Unhealthy"
      : a >= 101
        ? "Sensitive"
        : a >= 51
          ? "Moderate"
          : "Good";
}

function getAqiColor(a: number) {
  return a >= 201 ? "#8b1a1a" : a >= 151 ? "#e25656" : a >= 101 ? "#ff9e3d" : a >= 51 ? "#f5b041" : "#55b5d9";
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const opsCenter: LatLng = { lat: 34.0522, lng: -118.2437 };

const actionIcons: Record<OpusCommanderActionType, React.ElementType> = {
  dispatch: Truck,
  alert: Send,
  route: Route,
  evacuation: MapPinned,
  monitor: Radio,
};

const suggestionIcons = {
  brief: ClipboardList,
  plan: BrainCircuit,
  alert: Send,
  watch: Radio,
  dispatch: Truck,
  route: Route,
  evacuation: MapPinned,
} satisfies Record<string, React.ElementType>;

const actionTone: Record<OpusCommanderActionType, string> = {
  dispatch: "border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/12",
  alert: "border-[var(--color-ember)]/28 bg-[var(--color-ember-soft)]/14",
  route: "border-white/[0.09] bg-white/[0.035]",
  evacuation: "border-[var(--color-red)]/25 bg-[var(--color-red-soft)]/15",
  monitor: "border-white/[0.08] bg-black/24",
};

const riskStyles: Record<OpusCommanderRiskLevel, string> = {
  watch: "border-[var(--color-cyan)]/35 bg-[var(--color-cyan-soft)]/18 text-[var(--color-cyan)]",
  prepare: "border-[var(--color-amber)]/35 bg-[var(--color-amber-soft)]/20 text-[var(--color-amber)]",
  leave: "border-[var(--color-red)]/35 bg-[var(--color-red-soft)]/22 text-[var(--color-red)]",
};

function traceStatusClass(status: OpusCommanderTraceStep["status"]) {
  if (status === "complete") return "border-[var(--color-cyan)]/35 bg-[var(--color-cyan)]";
  if (status === "failed") return "border-[var(--color-red)]/35 bg-[var(--color-red)]";
  return "border-white/[0.14] bg-white/35";
}

function messageContent(message: VapiMessage) {
  return message.content ?? message.transcript ?? "";
}

function normalizeAssistantCommand(command: string) {
  return command
    .replace(/\bPinebridge\b/gi, "Pine Ridge")
    .replace(/\bPioneer(?=\s+(?:autonomous\s+)?(?:fire\s+)?mission\b|\s+fire\b)/gi, "Pine Ridge")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptForCommand(command: string) {
  return [{ role: "user" as const, content: command.trim() }];
}

function approvalPayloadFromAction(action?: OpusCommanderAction | null) {
  const payload = action?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const value = payload as { pendingActionId?: unknown; approvalToken?: unknown };
  return {
    pendingActionId: typeof value.pendingActionId === "string" ? value.pendingActionId : undefined,
    approvalToken: typeof value.approvalToken === "string" ? value.approvalToken : undefined,
  };
}

function incidentMatchesCommand(command: string, incidentName?: string | null, incidentId?: string) {
  const normalized = command.toLowerCase();
  const name = incidentName?.toLowerCase().trim();
  if (!name) return false;
  if (normalized.includes(name) || (incidentId && normalized.includes(incidentId.toLowerCase()))) return true;

  const meaningfulTerms = name
    .replace(/\b(fire|wildfire|incident)\b/g, "")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2);

  return meaningfulTerms.length > 0 && meaningfulTerms.every((term) => normalized.includes(term));
}

type EvacuaBriefingResult = {
  brief: string;
  spokenBrief?: string;
  operatorChecklist?: string[];
  confidence?: number;
  incidentId?: string;
  incidentName?: string;
  incidentBriefMarkdown?: string;
  toolTrace?: OpusCommanderTraceStep[];
};

type DynamicAssistantSuggestion = {
  id: string;
  title: string;
  description: string;
  command: string;
  tone: "cyan" | "ember" | "red" | "muted";
  icon: keyof typeof suggestionIcons;
};

type EvacuaAgentRun = {
  runId: string;
  status: "running" | "complete" | "failed";
  objective: string;
  incidentId?: string;
  incidentName?: string;
  summary: string;
  riskLevel: OpusCommanderRiskLevel;
  findings: Array<{
    role: "incident_analyst" | "logistics_analyst" | "comms_analyst" | "safety_reviewer";
    title: string;
    detail: string;
    evidence: string;
    severity: "watch" | "elevated" | "critical";
  }>;
  recommendedActions: OpusCommanderAction[];
  trace: OpusCommanderTraceStep[];
  handoffs: OpusCommanderHandoff[];
  safetyReview: {
    status: "ready_for_operator_review" | "needs_operator_review" | "blocked";
    summary: string;
    flags: string[];
    approvalRequired: true;
  };
  digitalTwin: {
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
  autonomousMission?: EvacuaAutonomousMission;
  incidentTriage?: EvacuaIncidentTriageItem[];
  tasks?: EvacuaAgentTask[];
  dispatchWorkflow?: EvacuaDispatchWorkflowStep[];
  icsArtifacts?: EvacuaIcsArtifacts;
  approvalQueue?: EvacuaApprovalQueueItem[];
  alertDraft?: string;
  incidentBriefMarkdown?: string;
};

type DispatchMission = {
  id: string;
  incidentId: string;
  incidentName: string;
  status: "dispatching" | "en_route" | "failed";
  stationName: string;
  teamNumber?: number;
  etaIso?: string | null;
  durationSeconds?: number;
  distanceKm?: number;
  createdAt: string;
  message?: string;
};

type JudgeDemoStage = "reset" | "focus" | "brief" | "agent" | "complete" | "failed";

type DispatchResponderResponse = {
  success?: boolean;
  error?: string;
  responder?: {
    id?: string;
    team_number?: number;
    firestation_name?: string;
    estimated_arrival?: string;
    estimated_duration?: number;
  };
  route?: {
    distance?: number;
    duration?: number;
  };
  station?: {
    name?: string;
  };
};

export default function Dashboard() {
  const [selectedIncident, setSelectedIncident] = useState<FireIncident | null>(null);
  const [alertSending, setAlertSending] = useState(false);
  const [alertStatus, setAlertStatus] = useState<string | null>(null);
  const [dispatchSending, setDispatchSending] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [dispatchMission, setDispatchMission] = useState<DispatchMission | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantPlan, setAssistantPlan] = useState<OpusCommanderResponse | null>(null);
  const [assistantBrief, setAssistantBrief] = useState<EvacuaBriefingResult | null>(null);
  const [assistantRun, setAssistantRun] = useState<EvacuaAgentRun | null>(null);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<DynamicAssistantSuggestion[] | null>(null);
  const [assistantPlanLoading, setAssistantPlanLoading] = useState(false);
  const [assistantPlanError, setAssistantPlanError] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [judgeDemoStage, setJudgeDemoStage] = useState<JudgeDemoStage | null>(null);
  const { fireState, responderOps, routeOps, refresh } = useFireOps({ home: opsCenter });
  const {
    isSessionActive,
    isSpeaking,
    messages: vapiMessages,
    volumeLevel,
    start,
    stop,
    receiveOperatorMessage,
    receiveAgentMessage,
  } = useVapi();
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number } | null>(null);
  const { weather, loading: weatherLoading } = useWeather(mapCenter?.lat ?? null, mapCenter?.lon ?? null);

  const lastTimestampRef = useRef<string | null>(new Date().toISOString());
  const lastProcessedVoiceCommandRef = useRef<string | null>(null);
  const activeMissionRequestIdRef = useRef<string | null>(null);
  const dashboardSessionId = `dashboard-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden" && !isSessionActive) return;
      try {
        const url = lastTimestampRef.current
          ? `/api/vapi-webhook?since=${encodeURIComponent(lastTimestampRef.current)}`
          : "/api/vapi-webhook";
        const res = await fetch(url);
        const data = await res.json();
        if (data.messages?.length > 0) {
          data.messages.forEach((msg: { action: string; message: string; data?: unknown }) => {
            const messageData = msg.data && typeof msg.data === "object" ? msg.data as { clientRequestId?: string } : null;
            if (
              messageData?.clientRequestId &&
              messageData.clientRequestId !== activeMissionRequestIdRef.current
            ) {
              return;
            }
            receiveAgentMessage({ action: msg.action, message: msg.message, data: msg.data });
          });
          lastTimestampRef.current = data.latest_timestamp;
        }
      } catch {
        // The assistant feed is supplementary; stale polling should not block the command surface.
      }
    };
    const interval = setInterval(poll, isSessionActive ? 2000 : 15000);
    poll();
    return () => clearInterval(interval);
  }, [isSessionActive, receiveAgentMessage]);

  const handleIncidentSelect = useCallback((incident: FireIncident | null) => {
    if (!incident) return;
    const raw = incident as FireIncident & { risk_level?: FireIncident["risk"] };
    const normalized: FireIncident = {
      id: String(raw.id || ""),
      name: raw.name || null,
      risk: (raw.risk || raw.risk_level || "low") as FireIncident["risk"],
      lat: raw.lat || null,
      lon: raw.lon || null,
      containment: raw.containment || null,
      last_update: raw.last_update || new Date().toISOString(),
      description: raw.description || null,
    };
    setSelectedIncident(normalized);
    if (normalized.lat && normalized.lon) setMapCenter({ lat: normalized.lat, lon: normalized.lon });
  }, []);

  const currentIncidents = useMemo<FireIncident[]>(
    () =>
      (fireState?.fires ?? []).map((fire) => ({
        id: fire.id,
        name: fire.name,
        risk: (["low", "medium", "high", "critical"].includes(fire.risk_level) ? fire.risk_level : "low") as FireIncident["risk"],
        lat: fire.lat,
        lon: fire.lon,
        containment: fire.containment,
        last_update: fire.last_update,
        description: fire.description,
      })),
    [fireState?.fires],
  );
  const incidentCount = currentIncidents.length;

  const responderStats = useMemo(() => {
    if (!responderOps || !fireState || !fireState.firestations) {
      return { available: 0, dispatched: 0, active: 0, eta: undefined as string | undefined };
    }

    if (!selectedIncident) {
      return {
        available: responderOps.totals.available,
        dispatched: responderOps.totals.dispatched,
        active: responderOps.totals.active,
        eta: undefined as string | undefined,
      };
    }

    const nearbyStations = fireState.firestations.filter((station) => {
      if (!selectedIncident.lat || !selectedIncident.lon) return false;
      return distanceKm(selectedIncident.lat, selectedIncident.lon, station.lat, station.lon) <= 100;
    });
    const scopedStations = nearbyStations.length > 0 ? nearbyStations : fireState.firestations;
    const nearbyStationIds = new Set(scopedStations.map((station) => station.id));
    const available = responderOps.stats
      .filter((station) => nearbyStationIds.has(station.firestation_id))
      .reduce((sum, station) => sum + (station.available_teams || 0), 0);

    const incidentId = String(selectedIncident.id);
    const forThis = responderOps.activeResponders.filter((responder) => String(responder.incidentId) === incidentId);
    const dispatched = forThis.filter((responder) => responder.status === "dispatched" || responder.status === "en_route").length;
    const active = forThis.filter((responder) => responder.status === "on_scene").length;

    let eta: string | undefined;
    if (dispatched > 0 && selectedIncident.lat && selectedIncident.lon) {
      let minDistance = Infinity;
      for (const station of scopedStations) {
        minDistance = Math.min(minDistance, distanceKm(selectedIncident.lat, selectedIncident.lon, station.lat, station.lon));
      }
      if (Number.isFinite(minDistance)) {
        eta = `${Math.ceil((minDistance * 0.621371) / 1.0)} min`;
      }
    }

    return { available, dispatched, active, eta };
  }, [responderOps, selectedIncident, fireState]);

  const handleEmergencyAlert = useCallback(async (action?: OpusCommanderAction) => {
    if (!selectedIncident) {
      setAlertStatus("Select an incident before issuing an alert.");
      setTimeout(() => setAlertStatus(null), 3000);
      return;
    }
    setAlertSending(true);
    setAlertStatus(null);
    try {
      const res = await fetch("/api/send-emergency-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incident: selectedIncident,
          ...approvalPayloadFromAction(action),
        }),
      });
      const result = await res.json();
      setAlertStatus(
        result.success
          ? result.dryRun
            ? `Prepared: ${result.message ?? "alert draft ready."}`
            : `Success: ${result.message ?? "emergency alert queued."}`
          : `Alert failed: ${result.error}`,
      );
    } catch {
      setAlertStatus("Alert failed: dispatch service unavailable.");
    } finally {
      setAlertSending(false);
      setTimeout(() => setAlertStatus(null), 5000);
    }
  }, [selectedIncident]);

  const handleDispatchResponder = useCallback(async (action?: OpusCommanderAction) => {
    if (!selectedIncident) {
      setDispatchStatus("Select an incident before dispatching.");
      setTimeout(() => setDispatchStatus(null), 4000);
      return;
    }
    if (responderStats.available === 0) {
      setDispatchStatus("No available teams in range of this incident.");
      setTimeout(() => setDispatchStatus(null), 4000);
      return;
    }

    setDispatchSending(true);
    setDispatchStatus(null);
    const createdAt = new Date().toISOString();
    setDispatchMission({
      id: `dispatch-${selectedIncident.id}-${Date.now()}`,
      incidentId: selectedIncident.id,
      incidentName: selectedIncident.name ?? "Selected incident",
      status: "dispatching",
      stationName: "Selecting nearest station",
      createdAt,
      message: "Evacua is finding the nearest available crew and plotting the route.",
    });
    try {
      const res = await fetch("/api/dispatch-responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: selectedIncident.id,
          incidentLat: selectedIncident.lat,
          incidentLon: selectedIncident.lon,
          suppressAgentMessage: true,
          ...approvalPayloadFromAction(action),
        }),
      });
      const result = (await res.json()) as DispatchResponderResponse;

      if (result.success) {
        const stationName = result.responder?.firestation_name ?? result.station?.name ?? "Nearest station";
        const teamNumber = result.responder?.team_number;
        const durationSeconds = result.responder?.estimated_duration ?? result.route?.duration;
        const etaIso =
          result.responder?.estimated_arrival ??
          (durationSeconds ? new Date(Date.now() + durationSeconds * 1000).toISOString() : null);
        setDispatchStatus(
          `Success: team ${teamNumber ?? "assigned"} dispatched from ${stationName}.`,
        );
        setDispatchMission({
          id: result.responder?.id ?? `dispatch-${selectedIncident.id}-${Date.now()}`,
          incidentId: selectedIncident.id,
          incidentName: selectedIncident.name ?? "Selected incident",
          status: "en_route",
          stationName,
          teamNumber,
          etaIso,
          durationSeconds,
          distanceKm: typeof result.route?.distance === "number" ? result.route.distance / 1000 : undefined,
          createdAt,
          message: "Route is live. The responder marker will advance on the map as the feed refreshes.",
        });
        setTimeout(async () => {
          await refresh();
        }, 800);
      } else {
        setDispatchStatus(`Dispatch failed: ${result.error || "Unknown error"}`);
        setDispatchMission((mission) =>
          mission
            ? {
                ...mission,
                status: "failed",
                stationName: mission.stationName === "Selecting nearest station" ? "No station assigned" : mission.stationName,
                message: result.error || "Dispatch service could not assign a responder.",
              }
            : null,
        );
      }
    } catch {
      setDispatchStatus("Dispatch failed: service unavailable.");
      setDispatchMission((mission) =>
        mission
          ? {
              ...mission,
              status: "failed",
              stationName: mission.stationName === "Selecting nearest station" ? "No station assigned" : mission.stationName,
              message: "Dispatch service unavailable.",
            }
          : null,
      );
    } finally {
      setDispatchSending(false);
      setTimeout(() => setDispatchStatus(null), 6000);
    }
  }, [refresh, responderStats.available, selectedIncident]);

  const handleVoiceToggle = () => {
    if (isSessionActive) stop();
    else start();
  };

  const focusIncidentById = useCallback((incidentId: string) => {
    const found = currentIncidents.find((incident) => incident.id === incidentId);
    if (found) {
      handleIncidentSelect(found);
      return;
    }
    const fire = fireState?.fires.find((item) => item.id === incidentId);
    if (fire) {
      handleIncidentSelect({
        id: fire.id,
        name: fire.name,
        risk: fire.risk_level as FireIncident["risk"],
        lat: fire.lat,
        lon: fire.lon,
        containment: fire.containment,
        last_update: fire.last_update,
        description: fire.description,
      });
    }
  }, [currentIncidents, fireState?.fires, handleIncidentSelect]);

  const resolveIncidentIdFromCommand = useCallback((command: string) => {
    const currentMatch = currentIncidents.find((incident) =>
      incidentMatchesCommand(command, incident.name, incident.id),
    );
    if (currentMatch) return currentMatch.id;

    const fireMatch = fireState?.fires.find((fire) => incidentMatchesCommand(command, fire.name, fire.id));
    return fireMatch?.id ?? selectedIncident?.id;
  }, [currentIncidents, fireState?.fires, selectedIncident?.id]);

  const recentTranscript = useCallback((extra?: string) => {
    const transcript = vapiMessages
      .slice(-7)
      .map((message) => ({
        role: message.role,
        content: messageContent(message),
      }))
      .filter((message) => message.content);

    if (extra?.trim()) {
      transcript.push({ role: "user", content: extra.trim() });
    }

    return transcript;
  }, [vapiMessages]);

  const buildVoiceDashboardContext = useCallback(() => {
    const incidentId = selectedIncident?.id;
    const incidentName = selectedIncident?.name ?? undefined;
    const scopedRouteCount =
      routeOps?.routes.filter((route) => route.fire_id === incidentId || route.fire_name === incidentName).length ??
      routeOps?.routes.length ??
      0;
    const scopedEvacuationCount =
      routeOps?.evacuations.filter((zone) => zone.fire_id === incidentId).length ??
      routeOps?.evacuations.length ??
      0;

    return {
      dashboardSessionId,
      selectedIncidentId: selectedIncident?.id,
      selectedIncidentName: selectedIncident?.name,
      visibleIncidents: currentIncidents.slice(0, 20).map((incident) => ({
        id: incident.id,
        name: incident.name,
        risk: incident.risk,
        lat: incident.lat,
        lon: incident.lon,
        containment: incident.containment,
        last_update: incident.last_update,
        description: incident.description,
      })),
      activeRunId: assistantRun?.runId ?? assistantPlan?.runId,
      activeRun: assistantRun ?? undefined,
      activePlan: assistantPlan ?? undefined,
      activeBrief: assistantBrief ?? undefined,
      dispatchMission: dispatchMission ?? undefined,
      routeAdvisoryCount: scopedRouteCount,
      evacuationZoneCount: scopedEvacuationCount,
      responderTotals: responderOps?.totals ?? {
        available: responderStats.available,
        dispatched: responderStats.dispatched,
        active: responderStats.active,
        total: responderStats.available + responderStats.dispatched + responderStats.active,
      },
      timestamps: {
        fireState: fireState?.timestamp ?? "",
        routeOps: routeOps?.timestamp ?? "",
      },
    };
  }, [
    assistantBrief,
    assistantPlan,
    assistantRun,
    currentIncidents,
    dashboardSessionId,
    dispatchMission,
    fireState?.timestamp,
    responderOps?.totals,
    responderStats.active,
    responderStats.available,
    responderStats.dispatched,
    routeOps?.evacuations,
    routeOps?.routes,
    routeOps?.timestamp,
    selectedIncident,
  ]);

  const applyVoiceAgentResult = useCallback((result: VoiceAgentResponse) => {
    const patch = result.dashboardPatch;
    if (patch?.selectedIncidentId) {
      focusIncidentById(patch.selectedIncidentId);
    }
    if (patch?.run) {
      setAssistantRun(patch.run);
    }
    if (patch?.plan) {
      setAssistantPlan(patch.plan as OpusCommanderResponse);
      setDynamicSuggestions(null);
    }
    if (patch?.brief) {
      setAssistantBrief(patch.brief as EvacuaBriefingResult);
    }
    if (result.mode === "mission" || result.mode === "triage") {
      activeMissionRequestIdRef.current = null;
    }
    receiveAgentMessage({
      action: result.mode,
      message: result.spoken,
      data: result,
    });
    lastTimestampRef.current = new Date().toISOString();
  }, [focusIncidentById, receiveAgentMessage]);

  const handleRunAssistantPlan = useCallback(async ({
    command,
    judgeDemo = false,
  }: {
    command?: string;
    judgeDemo?: boolean;
  } = {}) => {
    setAssistantPlanLoading(true);
    setAssistantPlanError(null);
    if (!judgeDemo) setJudgeDemoStage(null);
    try {
      const operatorIntent =
        (command ? normalizeAssistantCommand(command) : "") ||
        [...recentTranscript()].reverse().find((message) => message.role === "user")?.content ||
        "Generate the safest incident action plan for the current disaster context.";
      const targetIncidentId = judgeDemo ? undefined : resolveIncidentIdFromCommand(operatorIntent);
      const clientRequestId = `mission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeMissionRequestIdRef.current = clientRequestId;
      receiveAgentMessage({
        action: "scan",
        message: `${targetIncidentId ? "Starting the requested fire mission" : "Starting an autonomous fire mission"}. I will show live briefing, command, role, and safety-review updates as they finish.`,
        data: {
          incidentId: targetIncidentId,
          clientRequestId,
        },
        speak: false,
      });

      const res = await fetch("/api/evacua-agent-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: targetIncidentId,
          objective: judgeDemo
            ? "Run the Pine Ridge operational scenario. Pick the highest-impact active fire and produce an auditable responder action plan."
            : operatorIntent,
          transcriptContext: transcriptForCommand(operatorIntent),
          suppressAgentMessage: true,
          emitProgressMessages: true,
          clientRequestId,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error ?? "Plan generation failed");

      const run = result as EvacuaAgentRun;
      const plan: OpusCommanderResponse = {
        runId: run.runId,
        model: "internal",
        summary: run.summary,
        riskLevel: run.riskLevel,
        recommendedActions: run.recommendedActions,
        alertDraft: run.alertDraft,
        toolTrace: run.trace,
        incidentId: run.incidentId,
        incidentName: run.incidentName,
        heuristicSummary: run.digitalTwin?.before.posture,
        agentHandoffs: run.handoffs,
        incidentBriefMarkdown: run.incidentBriefMarkdown,
      };
      setAssistantRun(run);
      setAssistantPlan(plan);
      setDynamicSuggestions(null);
      if (plan.incidentId && plan.incidentId !== selectedIncident?.id) {
        focusIncidentById(plan.incidentId);
      }
      setAssistantPlanLoading(false);

      const nextAction = plan.recommendedActions.find((action) => action.type === "dispatch" || action.type === "alert");
      receiveAgentMessage({
        action: "scan",
        message:
          run.autonomousMission?.spokenUpdate ??
          (nextAction
            ? `${plan.incidentName ?? "Incident"} autonomous mission ready. Next approval item: ${nextAction.title}.`
            : `${plan.incidentName ?? "Incident"} autonomous mission ready. Review the dispatch workflow and safety gates.`),
        data: {
          runId: plan.runId,
          incidentId: plan.incidentId,
          riskLevel: plan.riskLevel,
          clientRequestId,
        },
      });
      lastTimestampRef.current = new Date().toISOString();
      activeMissionRequestIdRef.current = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Plan generation failed";
      setAssistantPlanError(message);
      receiveAgentMessage({
        action: "scan",
        message: `Evacua could not generate a plan: ${message}`,
      });
      activeMissionRequestIdRef.current = null;
    } finally {
      setAssistantPlanLoading(false);
    }
  }, [focusIncidentById, receiveAgentMessage, recentTranscript, resolveIncidentIdFromCommand, selectedIncident]);

  const handleGenerateEvacuaBrief = useCallback(async (operatorQuestion?: string) => {
    setBriefLoading(true);
    try {
      const transcript = recentTranscript(operatorQuestion).slice(-8);
      const latestOperatorQuestion =
        operatorQuestion?.trim() ||
        [...transcript].reverse().find((message) => message.role === "user")?.content ||
        undefined;
      const res = await fetch("/api/evacua-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: latestOperatorQuestion ? resolveIncidentIdFromCommand(latestOperatorQuestion) : selectedIncident?.id,
          home: opsCenter,
          operatorQuestion: latestOperatorQuestion,
          recentTranscript: latestOperatorQuestion ? transcriptForCommand(latestOperatorQuestion) : transcript.slice(-3),
          suppressAgentMessage: true,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error ?? "Briefing failed");
      setAssistantBrief(result as EvacuaBriefingResult);
      receiveAgentMessage({
        action: "scan",
        message: result.spokenBrief ?? result.brief,
        data: result,
      });
      lastTimestampRef.current = new Date().toISOString();
    } catch {
      receiveAgentMessage({
        action: "scan",
        message: "Evacua briefing is unavailable. Continue with the visible incident plan and approval-gated actions.",
      });
    } finally {
      setBriefLoading(false);
    }
  }, [receiveAgentMessage, recentTranscript, resolveIncidentIdFromCommand, selectedIncident]);

  const handleJudgeDemo = useCallback(async () => {
    if (demoRunning || assistantPlanLoading || briefLoading) return;
    setDemoRunning(true);
    setJudgeDemoStage("reset");
    receiveAgentMessage({
      action: "scenario",
      message: "Starting the Pine Ridge scenario. I will load incident state, focus the fire, brief command, and prepare approval-gated actions.",
    });
    setAssistantPlanError(null);
    setAssistantPlan(null);
    setAssistantBrief(null);
    setAssistantRun(null);
    try {
      const resetRes = await fetch("/api/demo/reset", { method: "POST" });
      const reset = await resetRes.json();
      if (!resetRes.ok) throw new Error(reset?.error ?? "Demo reset failed");

      setJudgeDemoStage("focus");
      receiveAgentMessage({
        action: "scenario",
        message: "Scenario reset complete. Focusing Pine Ridge Fire on the map and command context.",
      });
      const pine = reset.fireState?.fires?.find((fire: FireStateResponse["fires"][number]) =>
        /pine ridge/i.test(fire.name),
      ) ?? reset.fireState?.fires?.[0];
      if (pine) {
        handleIncidentSelect({
          id: pine.id,
          name: pine.name,
          risk: pine.risk_level as FireIncident["risk"],
          lat: pine.lat,
          lon: pine.lon,
          containment: pine.containment,
          last_update: pine.last_update,
          description: pine.description,
        });
        setMapCenter({ lat: pine.lat, lon: pine.lon });
      }

      await refresh();
      setJudgeDemoStage("brief");
      receiveAgentMessage({
        action: "scenario",
        message: "Incident focused. I am building a short command brief from fire, responder, route, and evacuation context.",
      });
      await handleGenerateEvacuaBrief("Give me the Pine Ridge incident brief for the operational scenario.");
      setJudgeDemoStage("agent");
      receiveAgentMessage({
        action: "scenario",
        message: "Brief complete. I am now running the autonomous mission: triage, dispatch workflow, role passes, and approval gates.",
      });
      await handleRunAssistantPlan({
        command: "Run the Pine Ridge operational action plan with approval-gated dispatch and alert preview.",
        judgeDemo: true,
      });
      setJudgeDemoStage("complete");
      receiveAgentMessage({
        action: "scenario",
        message: "Autonomous mission is ready. Review Mission Control and approve only the actions you want to execute.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scenario run failed";
      setJudgeDemoStage("failed");
      setAssistantPlanError(message);
      receiveAgentMessage({ action: "scan", message: `Scenario run could not start: ${message}` });
    } finally {
      setDemoRunning(false);
    }
  }, [
    assistantPlanLoading,
    briefLoading,
    demoRunning,
    handleGenerateEvacuaBrief,
    handleIncidentSelect,
    handleRunAssistantPlan,
    receiveAgentMessage,
    refresh,
  ]);

  const routeAssistantCommand = useCallback(async (command: string) => {
    if (!command || assistantPlanLoading || briefLoading) return;
    const normalizedCommand = normalizeAssistantCommand(command);
    const clientRequestId = `voice-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeMissionRequestIdRef.current = clientRequestId;
    setAssistantPlanLoading(true);
    setAssistantPlanError(null);
    try {
      const res = await fetch("/api/voice-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utterance: normalizedCommand,
          source: "dashboard",
          clientRequestId,
          dashboardContext: buildVoiceDashboardContext(),
          recentTranscript: recentTranscript(normalizedCommand).slice(-8),
        }),
      });
      const result = (await res.json()) as VoiceAgentResponse & { error?: string };
      if (!res.ok) throw new Error(result.error ?? "Voice-agent request failed");
      applyVoiceAgentResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice-agent request failed";
      setAssistantPlanError(message);
      receiveAgentMessage({
        action: "error",
        message: `Evacua could not complete that request: ${message}`,
      });
    } finally {
      activeMissionRequestIdRef.current = null;
      setAssistantPlanLoading(false);
    }
  }, [
    applyVoiceAgentResult,
    assistantPlanLoading,
    briefLoading,
    buildVoiceDashboardContext,
    receiveAgentMessage,
    recentTranscript,
  ]);

  const handleAssistantFollowUp = useCallback(async (command: string) => {
    if (!command || assistantPlanLoading || briefLoading) return;
    receiveOperatorMessage(command);
    await routeAssistantCommand(command);
  }, [assistantPlanLoading, briefLoading, receiveOperatorMessage, routeAssistantCommand]);

  const handleAssistantPromptSubmit = async () => {
    const command = assistantPrompt.trim();
    if (!command || assistantPlanLoading || briefLoading) return;

    receiveOperatorMessage(command);
    setAssistantPrompt("");
    await routeAssistantCommand(command);
  };

  useEffect(() => {
    if (assistantPlanLoading || briefLoading) return;

    const latestVoiceCommand = [...vapiMessages]
      .reverse()
      .find((message) => message.role === "user" && message.type === "transcript" && messageContent(message).trim());
    if (!latestVoiceCommand) return;

    const command = messageContent(latestVoiceCommand).trim();
    const key = `${latestVoiceCommand.timestamp ?? "voice"}:${command}`;
    if (!command || lastProcessedVoiceCommandRef.current === key) return;

    lastProcessedVoiceCommandRef.current = key;
    const normalizedCommand = normalizeAssistantCommand(command);
    const task = window.setTimeout(() => {
      void routeAssistantCommand(normalizedCommand);
    }, 0);
    return () => window.clearTimeout(task);
  }, [assistantPlanLoading, briefLoading, routeAssistantCommand, vapiMessages]);

  useEffect(() => {
    if (assistantPlan?.recommendedActions.length) return;

    const incidentId = selectedIncident?.id;
    const incidentName = selectedIncident?.name ?? undefined;
    const routeAdvisoryCount =
      routeOps?.routes.filter((route) => route.fire_id === incidentId || route.fire_name === incidentName).length ??
      routeOps?.routes.length ??
      0;
    const evacuationZoneCount =
      routeOps?.evacuations.filter((zone) => zone.fire_id === incidentId).length ??
      routeOps?.evacuations.length ??
      0;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/assistant-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            incident: selectedIncident
              ? {
                  id: selectedIncident.id,
                  name: selectedIncident.name,
                  risk: selectedIncident.risk,
                  containment: selectedIncident.containment,
                  description: selectedIncident.description,
                  last_update: selectedIncident.last_update,
                }
              : null,
            regionalContext: {
              activeFireCount: fireState?.count.active_fires,
              responderAvailable: responderStats.available,
              responderDispatched: responderStats.dispatched,
              responderActive: responderStats.active,
              routeAdvisoryCount,
              evacuationZoneCount,
            },
            brief: assistantBrief
              ? {
                  brief: assistantBrief.brief,
                  spokenBrief: assistantBrief.spokenBrief,
                  operatorChecklist: assistantBrief.operatorChecklist,
                  incidentName: assistantBrief.incidentName,
                }
              : null,
            recentTranscript: recentTranscript().slice(-6),
          }),
        });
        const result = (await res.json()) as { suggestions?: DynamicAssistantSuggestion[] };
        if (!res.ok || !Array.isArray(result.suggestions)) return;
        setDynamicSuggestions(result.suggestions);
      } catch {
        if (!controller.signal.aborted) setDynamicSuggestions(null);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [
    assistantBrief,
    assistantPlan?.recommendedActions.length,
    fireState?.count.active_fires,
    recentTranscript,
    responderStats.active,
    responderStats.available,
    responderStats.dispatched,
    routeOps?.evacuations,
    routeOps?.routes,
    selectedIncident,
  ]);

  const activeFire = useMemo(
    () => (selectedIncident ? fireState?.fires.find((fire) => fire.id === selectedIncident.id) ?? null : null),
    [fireState?.fires, selectedIncident],
  );
  const totalResponderSignal = responderStats.available + responderStats.dispatched + responderStats.active;
  const riskPosture = selectedIncident?.risk ?? activeFire?.risk_level ?? "watch";

  return (
    <div className="evacua-shell evacua-noise relative min-h-[100dvh] overflow-hidden bg-[var(--color-bg-oled)] text-[var(--color-text-primary)]">
      <a
        href="#evacua-command-surface"
        className="sr-only z-50 rounded-lg border border-[var(--color-cyan)]/40 bg-black px-4 py-2 text-sm text-[var(--color-cyan)] focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to command surface
      </a>
      <OpsShellHeader
        subtitle={selectedIncident?.name ?? "California wildfire operations"}
        metrics={
          <>
            <OpsMetric icon={Flame} label="Incidents" value={incidentCount} tone="ember" />
            <OpsMetric icon={Truck} label="Teams" value={totalResponderSignal} tone="cyan" />
            <OpsMetric icon={Wind} label="Wind" value={weatherLoading ? "Sync" : weather ? `${weather.wind.speed} mph` : "Standby"} tone="muted" />
            <OpsMetric icon={Gauge} label="Posture" value={String(riskPosture)} tone={riskPosture === "critical" ? "red" : "muted"} />
          </>
        }
        actions={
          <>
            <Button
              type="button"
              variant="glass"
              size="sm"
              className="h-10"
              onClick={handleJudgeDemo}
              disabled={demoRunning || assistantPlanLoading || briefLoading}
              aria-busy={demoRunning}
            >
              {demoRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Play className="h-4 w-4" strokeWidth={1.75} />
              )}
              Run scenario
            </Button>
            <OpsStatusPill active={Boolean(fireState)} label={fireState ? "Feed active" : "Feed standby"} />
          </>
        }
      />

      <main id="evacua-command-surface" className="relative z-10 grid gap-3 p-3 lg:h-[calc(100dvh-73px)] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(320px,390px)] lg:overflow-hidden md:p-4">
        <section aria-label="Incidents and responders" className="flex min-h-0 flex-col gap-3">
          <Card className="evacua-panel flex min-h-[360px] flex-1 flex-col overflow-hidden">
            <CardHeader className="border-b border-white/[0.07]">
              <PanelHeading icon={Radio} label="Incident feed" value={`${incidentCount} live`} />
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
              <div className="h-full overflow-y-auto">
                <IncidentsList
                  incidents={currentIncidents}
                  loading={!fireState}
                  onIncidentClick={(incident) => handleIncidentSelect(incident as FireIncident)}
                  selectedId={selectedIncident?.id ?? undefined}
                />
              </div>
            </CardContent>
          </Card>

          <ResponderPanel
            selectedIncident={selectedIncident}
            responderStats={responderStats}
            dispatchSending={dispatchSending}
            dispatchStatus={dispatchStatus}
            dispatchMission={dispatchMission}
            onDispatch={handleDispatchResponder}
          />
        </section>

        <section aria-label="Operations map" className="relative min-h-[560px] overflow-hidden rounded-lg border border-white/[0.08] bg-black shadow-[0_30px_120px_-70px_rgba(0,0,0,1)] lg:min-h-0">
          <MapPanel
            home={opsCenter}
            fireState={fireState}
            responderOps={responderOps ? { activeResponders: responderOps.activeResponders } : undefined}
            routeOps={routeOps}
            windMph={weather?.wind.speed}
            windDeg={weather?.wind.deg}
            focusedEventId={selectedIncident?.id ?? undefined}
            onFocusEvent={(id) => {
              const found = currentIncidents.find((incident) => incident.id === id);
              if (found) handleIncidentSelect(found);
            }}
          />

          <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start justify-between gap-2">
            <div className="rounded-lg border border-white/[0.08] bg-black/65 px-3 py-2 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                <Sparkles className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
                3D operations lens
              </div>
              <p className="mt-1 max-w-[28ch] truncate text-sm font-medium text-white">
                {selectedIncident?.name ?? "Select incident"}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.08] bg-black/65 px-3 py-2 font-mono text-[10px] uppercase text-[var(--color-text-muted)] shadow-2xl backdrop-blur-xl">
              Mapbox dark terrain - live perimeter animation
            </div>
          </div>

          <CommandLens
            selectedIncident={selectedIncident}
            weather={weather}
            fireState={fireState}
            responderOps={responderOps}
          />
        </section>

        <section aria-label="Evacua assistant and mission control" className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-4 pr-1">
          <AssistantPanel
            isSessionActive={isSessionActive}
            isSpeaking={isSpeaking}
            messages={vapiMessages}
            volumeLevel={volumeLevel}
            onToggleVoice={handleVoiceToggle}
            briefLoading={briefLoading}
            planLoading={assistantPlanLoading}
            prompt={assistantPrompt}
            plan={assistantPlan}
            brief={assistantBrief}
            run={assistantRun}
            judgeDemoStage={judgeDemoStage}
            dynamicSuggestions={dynamicSuggestions}
            planError={assistantPlanError}
            selectedIncident={selectedIncident}
            dispatchSending={dispatchSending}
            dispatchStatus={dispatchStatus}
            dispatchMission={dispatchMission}
            dispatchDisabled={!selectedIncident || responderStats.available === 0 || dispatchSending}
            alertSending={alertSending}
            alertStatus={alertStatus}
            alertDisabled={!selectedIncident || alertSending}
            onPromptChange={setAssistantPrompt}
            onSubmitPrompt={handleAssistantPromptSubmit}
            onFollowUp={handleAssistantFollowUp}
            onDispatch={handleDispatchResponder}
            onPrepareAlert={handleEmergencyAlert}
            onFocusIncident={focusIncidentById}
          />

          <EnvironmentalPanel
            weather={weather}
            loading={weatherLoading}
            activeFire={activeFire}
          />

          <AlertPanel
            selectedIncident={selectedIncident}
            alertSending={alertSending}
            alertStatus={alertStatus}
            onAlert={handleEmergencyAlert}
          />
        </section>
      </main>
    </div>
  );
}

function PanelHeading({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <CardTitle className="flex items-center gap-2 text-[11px] uppercase text-[var(--color-text-muted)]">
        <Icon className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
        {label}
      </CardTitle>
      {value && <span className="font-mono text-[10px] uppercase text-[var(--color-text-muted)]">{value}</span>}
    </div>
  );
}

function ResponderPanel({
  selectedIncident,
  responderStats,
  dispatchSending,
  dispatchStatus,
  dispatchMission,
  onDispatch,
}: {
  selectedIncident: FireIncident | null;
  responderStats: { available: number; dispatched: number; active: number; eta?: string };
  dispatchSending: boolean;
  dispatchStatus: string | null;
  dispatchMission: DispatchMission | null;
  onDispatch: () => void;
}) {
  const canDispatch = Boolean(selectedIncident) && responderStats.available > 0 && !dispatchSending;
  return (
    <Card className="evacua-panel shrink-0">
      <CardHeader className="border-b border-white/[0.07]">
        <PanelHeading icon={Truck} label="Responder mesh" value={selectedIncident ? "incident scoped" : "regional"} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 divide-x divide-white/[0.07] rounded-lg border border-white/[0.07] bg-black/25">
          <ResponderStat label="Ready" value={responderStats.available} tone="cyan" />
          <ResponderStat label="En route" value={responderStats.dispatched} tone="amber" />
          <ResponderStat label="On scene" value={responderStats.active} tone="ember" />
        </div>

        {responderStats.eta && (
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/15 px-3 py-2">
            <span className="text-xs text-[var(--color-text-muted)]">Nearest ETA</span>
            <span className="font-mono text-sm text-[var(--color-cyan)]">{responderStats.eta}</span>
          </div>
        )}

        {dispatchMission && <DispatchMissionCard mission={dispatchMission} />}

        {dispatchStatus && (
          <StatusNotice tone={dispatchStatus.startsWith("Success") ? "success" : "danger"}>{dispatchStatus}</StatusNotice>
        )}

        <Button
          type="button"
          variant={canDispatch ? "cyan" : "glass"}
          className="w-full"
          disabled={!canDispatch}
          onClick={onDispatch}
        >
          <Truck className={cn("h-4 w-4", dispatchSending && "animate-pulse")} strokeWidth={1.75} />
          {dispatchSending ? "Dispatching" : canDispatch ? "Dispatch team" : "Dispatch locked"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DispatchMissionCard({ mission }: { mission: DispatchMission }) {
  const progress = getDispatchProgress(mission);
  const etaLabel = mission.status === "failed" ? "assignment failed" : formatDispatchEta(mission.etaIso);
  const distanceLabel = typeof mission.distanceKm === "number" ? `${mission.distanceKm.toFixed(1)} km route` : "route syncing";

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-cyan)]/20 bg-[var(--color-cyan-soft)]/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start gap-3 p-3">
        <EvacuaDispatchLogo active={mission.status !== "failed"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {mission.status === "dispatching" ? "Dispatching crew" : mission.status === "failed" ? "Dispatch blocked" : "Dispatch live"}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{mission.incidentName}</p>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                "shrink-0 font-mono text-[9px] uppercase",
                mission.status === "failed" ? "border-[var(--color-red)]/25 text-[var(--color-red)]" : "border-[var(--color-cyan)]/25 text-[var(--color-cyan)]",
              )}
            >
              {mission.status === "en_route" ? "en route" : mission.status}
            </Badge>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <DispatchFact label="Team" value={mission.teamNumber ? `Team ${mission.teamNumber}` : "Assigning"} />
            <DispatchFact label="Station" value={mission.stationName} />
            <DispatchFact label="ETA" value={etaLabel} />
            <DispatchFact label="Route" value={distanceLabel} />
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
              <span>{mission.message ?? "Dispatch workflow active."}</span>
              <span className="font-mono">{Math.round(progress)}%</span>
            </div>
            <Progress
              value={progress}
              label={`Dispatch progress ${Math.round(progress)}%`}
              className="h-1.5 bg-white/[0.06]"
              indicatorClassName={mission.status === "failed" ? "bg-[var(--color-red)]" : "bg-[var(--color-cyan)]"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EvacuaDispatchLogo({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "evacua-sheen relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border",
        active
          ? "border-[var(--color-ember)]/30 bg-[var(--color-ember-soft)]/30 shadow-[0_0_34px_-16px_var(--color-ember)]"
          : "border-[var(--color-red)]/25 bg-[var(--color-red-soft)]/20",
      )}
    >
      <Flame className={cn("h-5 w-5", active ? "text-[var(--color-ember)]" : "text-[var(--color-red)]")} strokeWidth={1.75} />
    </div>
  );
}

function DispatchFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
      <p className="text-[9px] uppercase text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-text-secondary)]">{value}</p>
    </div>
  );
}

function getDispatchProgress(mission: DispatchMission) {
  if (mission.status === "failed") return 100;
  if (mission.status === "dispatching") return 18;
  if (!mission.durationSeconds || !mission.etaIso) return 42;
  const eta = Date.parse(mission.etaIso);
  const started = Date.parse(mission.createdAt);
  if (!Number.isFinite(eta) || !Number.isFinite(started) || eta <= started) return 72;
  const elapsed = Date.now() - started;
  return Math.max(22, Math.min(94, (elapsed / (mission.durationSeconds * 1000)) * 100));
}

function formatDispatchEta(etaIso?: string | null) {
  if (!etaIso) return "ETA syncing";
  const eta = Date.parse(etaIso);
  if (!Number.isFinite(eta)) return "ETA syncing";
  const minutes = Math.max(1, Math.ceil((eta - Date.now()) / 60_000));
  return `${minutes} min`;
}

function ResponderStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "ember";
}) {
  const color =
    tone === "cyan" ? "text-[var(--color-cyan)]" : tone === "amber" ? "text-[var(--color-amber)]" : "text-[var(--color-ember)]";
  return (
    <div className="px-3 py-3 text-center">
      <p className={cn("font-mono text-xl tabular-nums", color)}>{value}</p>
      <p className="mt-1 text-[10px] uppercase text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

function AssistantPanel({
  isSessionActive,
  isSpeaking,
  messages,
  volumeLevel,
  onToggleVoice,
  briefLoading,
  planLoading,
  prompt,
  plan,
  brief,
  run,
  judgeDemoStage,
  dynamicSuggestions,
  planError,
  selectedIncident,
  dispatchSending,
  dispatchStatus,
  dispatchMission,
  dispatchDisabled,
  alertSending,
  alertStatus,
  alertDisabled,
  onPromptChange,
  onSubmitPrompt,
  onFollowUp,
  onDispatch,
  onPrepareAlert,
  onFocusIncident,
}: {
  isSessionActive: boolean;
  isSpeaking: boolean;
  messages: VapiMessage[];
  volumeLevel: number;
  onToggleVoice: () => void;
  briefLoading: boolean;
  planLoading: boolean;
  prompt: string;
  plan: OpusCommanderResponse | null;
  brief: EvacuaBriefingResult | null;
  run: EvacuaAgentRun | null;
  judgeDemoStage: JudgeDemoStage | null;
  dynamicSuggestions: DynamicAssistantSuggestion[] | null;
  planError: string | null;
  selectedIncident: FireIncident | null;
  dispatchSending: boolean;
  dispatchStatus: string | null;
  dispatchMission: DispatchMission | null;
  dispatchDisabled: boolean;
  alertSending: boolean;
  alertStatus: string | null;
  alertDisabled: boolean;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: () => void;
  onFollowUp: (command: string) => void;
  onDispatch: (action?: OpusCommanderAction) => void;
  onPrepareAlert: (action?: OpusCommanderAction) => void;
  onFocusIncident: (incidentId: string) => void;
}) {
  const busy = briefLoading || planLoading;
  const missionReady = Boolean(run?.autonomousMission);
  const missionMode = Boolean(missionReady || judgeDemoStage);
  const focusedOnPlanIncident = !plan?.incidentId || selectedIncident?.id === plan.incidentId;
  const contextName = selectedIncident?.name ?? plan?.incidentName ?? brief?.incidentName ?? "Highest impact fire";
  const signalValue = isSessionActive ? Math.max(Math.min(volumeLevel * 100, 100), isSpeaking ? 72 : 28) : busy ? 62 : 14;
  const voiceMode = planLoading || briefLoading ? "thinking" : isSpeaking ? "speaking" : isSessionActive ? "listening" : "idle";
  const voiceState = planLoading
    ? "Running agent mission"
    : briefLoading
      ? "Synthesizing brief"
      : isSpeaking
        ? "Evacua speaking"
        : isSessionActive
          ? "Listening live"
          : "Voice standby";
  const voicePrompt = busy
    ? "Evacua is triaging incidents, checking resources, and preparing safe next steps."
    : isSpeaking
      ? "Evacua is responding. Tap the blob to stop the voice session."
      : isSessionActive
        ? "Evacua is listening. Tap the blob to stop the voice session."
        : "Tap the blob to start talking.";
  const transcriptMessages = messages.slice(-12);
  const operatorHasReplied = transcriptMessages.some((message) => message.role === "user" && messageContent(message).trim());
  const conversationStarted = operatorHasReplied;
  const latestOperator = [...messages].reverse().find((message) => message.role === "user");
  const latestAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const activityItems = [
    planLoading && {
      id: "plan-loading",
      label: "Agent mission",
      detail: "Triaging incidents, checking resources, and preparing approval-gated actions.",
      status: "running",
    },
    briefLoading && {
      id: "brief-loading",
      label: "Briefing",
      detail: "Compressing the current incident into operator-ready guidance.",
      status: "running",
    },
    dispatchSending && {
      id: "dispatch-sending",
      label: "Dispatch",
      detail: "Approval accepted. Sending the nearest available response team.",
      status: "running",
    },
    dispatchMission && !dispatchSending && {
      id: `dispatch-${dispatchMission.id}`,
      label: "Dispatch",
      detail:
        dispatchMission.status === "failed"
          ? dispatchMission.message ?? "Dispatch could not assign a response team."
          : `${dispatchMission.teamNumber ? `Team ${dispatchMission.teamNumber}` : "Team"} from ${dispatchMission.stationName} is en route to ${dispatchMission.incidentName}.`,
      status: dispatchMission.status === "failed" ? "failed" : "complete",
    },
    alertSending && {
      id: "alert-sending",
      label: "Alert",
      detail: "Approval accepted. Preparing public alert guidance.",
      status: "running",
    },
    ...(run?.trace.slice(-3).map((item) => ({
      id: `${item.step}-${item.status}`,
      label: item.step,
      detail: item.detail,
      status: item.status,
    })) ?? []),
  ].filter(Boolean) as Array<{ id: string; label: string; detail: string; status: string }>;

  function handlePlanAction(action: OpusCommanderAction) {
    if (!focusedOnPlanIncident && plan?.incidentId) {
      onFocusIncident(plan.incidentId);
      return;
    }
    if (action.type === "dispatch") onDispatch(action);
    if (action.type === "alert") onPrepareAlert(action);
  }

  const suggestedActions = buildAssistantSuggestions({
    plan,
    brief,
    dynamicSuggestions,
    selectedIncident,
    focusedOnPlanIncident,
    dispatchDisabled,
    alertDisabled,
    dispatchSending,
    alertSending,
    onFollowUp,
    onPlanAction: handlePlanAction,
  });
  const topSuggestedActions = missionReady ? [] : suggestedActions;
  const voiceSuggestedActions = conversationStarted ? [] : topSuggestedActions;
  const showActivityFeed = !missionReady || dispatchSending || alertSending;

  return (
    <div className="flex shrink-0 flex-col gap-3 overflow-visible">
        <motion.section
          layout
          transition={{ layout: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
          className={cn(
            "relative grid place-items-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#05080c] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_80px_-60px_rgba(85,181,217,0.8)]",
            conversationStarted ? "h-[min(46dvh,430px)] min-h-[320px] max-h-[430px] shrink-0 px-2 py-2" : "shrink-0 px-4 py-4",
          )}
        >
          <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_30%,rgba(85,181,217,0.24),transparent_34%),radial-gradient(circle_at_32%_68%,rgba(10,37,48,0.72),transparent_38%),radial-gradient(circle_at_78%_76%,rgba(255,158,61,0.18),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-10 top-10 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <motion.div
            layout
            className={cn(
              "relative flex w-full flex-col",
              conversationStarted ? "h-full max-w-full items-stretch text-left" : "max-w-[330px] items-center text-center",
            )}
          >
            <motion.div layout className={cn("flex w-full", conversationStarted ? "hidden" : "flex-col items-center")}>
              <VoiceOrb mode={voiceMode} volumeLevel={signalValue} onToggleVoice={onToggleVoice} compact={conversationStarted} />
              {!conversationStarted && (
                <motion.div layout className="mt-3 flex flex-col items-center gap-2">
                  <Badge variant={plan ? "outline" : "secondary"} className={cn("font-mono uppercase", plan && riskStyles[plan.riskLevel])}>
                    {plan ? `${plan.riskLevel} posture` : voiceState}
                  </Badge>
                  <div>
                    <p className="text-[17px] font-semibold tracking-tight text-white">{contextName}</p>
                    <p className="mx-auto mt-1 max-w-[30ch] text-xs leading-relaxed text-[var(--color-text-muted)]">
                      {voicePrompt}
                    </p>
                  </div>
                </motion.div>
              )}
            </motion.div>

            {!conversationStarted && (
              <>
                <form
                  className="mt-3 w-full rounded-xl border border-white/[0.08] bg-black/32 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSubmitPrompt();
                  }}
                >
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={prompt}
                      onChange={(event) => onPromptChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          onSubmitPrompt();
                        }
                      }}
                      rows={1}
                      aria-label="Command for Evacua"
                      className="min-h-10 resize-none border-transparent bg-transparent px-2 py-2 text-xs focus-visible:border-transparent focus-visible:ring-0"
                      placeholder={isSessionActive ? "Listening... or type a backup command" : "Type a command for Evacua..."}
                    />
                    <Button type="submit" variant="cyan" size="icon" disabled={busy || !prompt.trim()} aria-label="Send typed command">
                      <Send className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                  </div>
                </form>

                {topSuggestedActions.length > 0 && (
                  <div className="mt-3 w-full rounded-xl border border-white/[0.07] bg-black/24 p-2">
                    <AssistantSuggestedActions
                      actions={topSuggestedActions}
                      busy={busy}
                      title={plan?.recommendedActions.length ? "Approval controls" : "Suggested next moves"}
                      hint={plan?.recommendedActions.length ? "tap one to approve" : "tap or speak"}
                    />
                  </div>
                )}
              </>
            )}
            <VoiceConversationSurface
              active={conversationStarted}
              messages={transcriptMessages}
              isSessionActive={isSessionActive}
              isSpeaking={isSpeaking}
              busy={busy}
              actions={voiceSuggestedActions}
              showEmptyActionsHint={!conversationStarted && !missionReady}
              voiceMode={voiceMode}
              volumeLevel={signalValue}
              onToggleVoice={onToggleVoice}
            />
          </motion.div>
        </motion.section>

        {(!conversationStarted || missionMode) && <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            {judgeDemoStage && (
              <JudgeDemoSequencePanel
                stage={judgeDemoStage}
                incidentName={run?.autonomousMission?.selectedIncidentName ?? plan?.incidentName ?? selectedIncident?.name ?? "Pine Ridge Fire"}
              />
            )}

            {showActivityFeed && (
              <AssistantActivityFeed
                items={activityItems}
                dispatchStatus={dispatchStatus}
                alertStatus={alertStatus}
                latestOperator={latestOperator}
                latestAssistant={latestAssistant}
              />
            )}

          {planError && (
            <div className="rounded-lg border border-[var(--color-red)]/25 bg-[var(--color-red-soft)]/18 px-3 py-2 text-xs text-[var(--color-red)]">
              {planError}
            </div>
          )}

          {(plan || planLoading) && (
            <AssistantPlanSurface
              plan={plan}
              run={run}
              loading={planLoading}
              incidentMismatch={!focusedOnPlanIncident}
              dispatchDisabled={dispatchDisabled}
              alertDisabled={alertDisabled}
              onAction={handlePlanAction}
            />
          )}

          {brief && !planLoading && !missionMode && (
            <AssistantBriefSurface brief={brief} onFollowUp={onFollowUp} />
          )}
          </div>
        </div>}
    </div>
  );
}

type AssistantSuggestion = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  tone: "cyan" | "ember" | "red" | "muted";
  disabled?: boolean;
  busy?: boolean;
  approval?: boolean;
  onClick: () => void;
};

const judgeDemoSteps: Array<{
  id: JudgeDemoStage;
  label: string;
  detail: string;
  icon: React.ElementType;
}> = [
  {
    id: "reset",
    label: "Load incident state",
    detail: "Pine Ridge scenario data is being prepared.",
    icon: RotateCcw,
  },
  {
    id: "focus",
    label: "Focus incident",
    detail: "Map and command context move to Pine Ridge Fire.",
    icon: MapPin,
  },
  {
    id: "brief",
    label: "Brief command",
    detail: "Evacua compresses risk, routes, responders, and zones.",
    icon: ClipboardList,
  },
  {
    id: "agent",
    label: "Run agent mission",
    detail: "Triage, dispatch workflow, ICS artifacts, and approvals are prepared.",
    icon: BrainCircuit,
  },
  {
    id: "complete",
    label: "Ready for review",
    detail: "The mission is ready; live actions stay approval-gated.",
    icon: CheckCircle2,
  },
];

function JudgeDemoSequencePanel({
  stage,
  incidentName,
}: {
  stage: JudgeDemoStage;
  incidentName: string;
}) {
  const activeIndex = stage === "failed" ? judgeDemoSteps.length - 1 : judgeDemoSteps.findIndex((step) => step.id === stage);
  const progress = stage === "failed" ? 100 : Math.max(10, ((activeIndex + 1) / judgeDemoSteps.length) * 100);
  const compact = stage === "complete" || stage === "failed";

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-cyan)]/22 bg-[var(--color-cyan-soft)]/10">
      <div className="border-b border-white/[0.07] bg-black/22 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
              <Play className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
              Evacua agent run
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-white">{incidentName}</p>
          </div>
          <span className={cn("rounded-md border px-2 py-1 font-mono text-[9px] uppercase", stage === "failed" ? "border-[var(--color-red)]/30 text-[var(--color-red)]" : "border-[var(--color-cyan)]/25 text-[var(--color-cyan)]")}>
            {stage === "complete" ? "complete" : stage === "failed" ? "failed" : "running"}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={cn("h-full rounded-full transition-all duration-500", stage === "failed" ? "bg-[var(--color-red)]" : "bg-[var(--color-cyan)]")}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      {!compact && (
        <div className="grid gap-1.5 p-2">
          {judgeDemoSteps.map((step, index) => {
            const Icon = step.icon;
            const complete = index < activeIndex;
            const active = index === activeIndex;
            return (
              <div
                key={step.id}
                className={cn(
                  "grid grid-cols-[28px_1fr] gap-2 rounded-lg border px-2 py-2",
                  complete
                    ? "border-[var(--color-cyan)]/20 bg-[var(--color-cyan-soft)]/10"
                    : active
                      ? "border-[var(--color-ember)]/24 bg-[var(--color-ember-soft)]/12"
                      : "border-white/[0.06] bg-black/18",
                )}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.08] bg-black/24">
                  {active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-ember)]" />
                  ) : (
                    <Icon className={cn("h-3.5 w-3.5", complete ? "text-[var(--color-cyan)]" : "text-[var(--color-text-muted)]")} strokeWidth={1.75} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-white">{step.label}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] leading-relaxed text-[var(--color-text-muted)]">{step.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VoiceConversationSurface({
  active,
  messages,
  isSessionActive,
  isSpeaking,
  busy,
  actions,
  showEmptyActionsHint,
  voiceMode,
  volumeLevel,
  onToggleVoice,
}: {
  active: boolean;
  messages: VapiMessage[];
  isSessionActive: boolean;
  isSpeaking: boolean;
  busy: boolean;
  actions: AssistantSuggestion[];
  showEmptyActionsHint: boolean;
  voiceMode: "idle" | "listening" | "speaking" | "thinking";
  volumeLevel: number;
  onToggleVoice: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleMessages = messages.filter((message) => messageContent(message).trim()).slice(-24);
  const scrollKey = visibleMessages
    .map((message) => `${message.timestamp ?? "now"}-${message.role ?? "assistant"}-${messageContent(message)}`)
    .join("|");

  useEffect(() => {
    if (!active) return;
    const scrollToLatest = () => {
      const container = scrollRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
    };
    const frame = requestAnimationFrame(scrollToLatest);
    const shortDelay = window.setTimeout(scrollToLatest, 80);
    const layoutDelay = window.setTimeout(scrollToLatest, 240);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(shortDelay);
      window.clearTimeout(layoutDelay);
    };
  }, [active, scrollKey, isSpeaking, busy, actions.length]);

  const voiceStatusLabel = busy
    ? "Preparing"
    : isSpeaking
      ? "Speaking"
      : isSessionActive
        ? "Listening"
        : "Ready";
  const voiceHint = busy
    ? "Evacua is turning this conversation into next steps."
    : isSpeaking
      ? "Evacua is answering now."
      : isSessionActive
        ? "Speak naturally. Evacua is listening for the next request."
        : "Ask for a plan, alert, or update.";
  const transcriptHeightClass = actions.length > 0 ? "h-[168px]" : "h-[270px]";

  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.section
          key="voice-conversation-surface"
          layout
          initial={{ opacity: 0, height: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, height: "100%", y: 0 }}
          exit={{ opacity: 0, height: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex h-full min-h-0 flex-col overflow-hidden text-left"
        >
          <button
            type="button"
            className="group z-10 flex w-full shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#05080c]/95 px-3 py-2.5 text-left outline-none backdrop-blur-xl transition-colors hover:bg-white/2.5 focus-visible:ring-2 focus-visible:ring-cyan/60"
            onClick={onToggleVoice}
            aria-label={isSessionActive ? "Stop voice session" : "Start voice session"}
          >
            <VoiceOrb mode={voiceMode} volumeLevel={volumeLevel} onToggleVoice={onToggleVoice} compact interactive={false} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold tracking-tight text-white">Voice assistant</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan/22 bg-cyan-soft/10 px-2 py-0.5 text-[9px] font-medium uppercase text-cyan">
                  <Volume2 className="h-3 w-3" strokeWidth={1.75} />
                  {voiceStatusLabel}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-text-muted">{voiceHint}</p>
            </div>
          </button>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">
            <div
              ref={scrollRef}
              className={cn(
                "min-h-0 shrink-0 touch-pan-y scroll-pb-4 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]",
                transcriptHeightClass,
              )}
              onWheel={(event) => event.stopPropagation()}
              onTouchMove={(event) => event.stopPropagation()}
              tabIndex={0}
              role="log"
              aria-label="Evacua conversation transcript"
              aria-live="polite"
            >
              {visibleMessages.length > 0 || isSessionActive || busy ? (
                <div className="flex min-h-full flex-col justify-end gap-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {visibleMessages.map((msg, index) => (
                      <VoiceMessageBubble key={`${msg.timestamp}-${msg.role}-${index}`} message={msg} />
                    ))}
                  </AnimatePresence>

                  {(isSpeaking || busy) && (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="rounded-lg border border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/12 px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-xs text-[var(--color-cyan)]">
                        <Volume2 className="h-4 w-4" strokeWidth={1.75} />
                        {busy ? "Curating next actions" : "Voice response active"}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="animate-progress h-full rounded-full bg-[var(--color-cyan)]" />
                      </div>
                    </motion.div>
                  )}
                  <div className="h-px shrink-0" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/18 px-3 py-4 text-center">
                  <p className="text-sm font-medium text-white">Conversation ready</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    Your spoken requests, Evacua replies, and command history will appear here live.
                  </p>
                </div>
              )}
            </div>

            {actions.length > 0 ? (
              <div className="max-h-[132px] shrink-0 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] p-2">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
                    <Sparkles className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
                    Suggested next steps
                  </span>
                  <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">tap one or say it aloud</span>
                </div>
                <AssistantSuggestedActions actions={actions} busy={busy} compact />
              </div>
            ) : showEmptyActionsHint ? (
              <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/18 px-3 py-3 text-xs text-[var(--color-text-muted)]">
                Evacua will convert the next recommendation into tappable actions here.
              </div>
            ) : null}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function VoiceMessageBubble({ message }: { message: VapiMessage }) {
  const isAssistant = message.role === "assistant";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex", isAssistant ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          "max-w-[88%] rounded-2xl border px-3 py-2",
          isAssistant
            ? "rounded-tl-md border-[var(--color-cyan)]/18 bg-[var(--color-cyan-soft)]/10"
            : "rounded-tr-md border-white/[0.07] bg-black/34",
        )}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
            {isAssistant ? (
              <Volume2 className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
            ) : (
              <Mic className="h-3 w-3" strokeWidth={1.75} />
            )}
            {isAssistant ? "Evacua" : "Operator"}
          </span>
          {message.timestamp && <span className="font-mono text-[9px] text-[var(--color-text-muted)]">{message.timestamp}</span>}
        </div>
        <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">{messageContent(message)}</p>
      </div>
    </motion.div>
  );
}

function buildAssistantSuggestions({
  plan,
  brief,
  dynamicSuggestions,
  selectedIncident,
  focusedOnPlanIncident,
  dispatchDisabled,
  alertDisabled,
  dispatchSending,
  alertSending,
  onFollowUp,
  onPlanAction,
}: {
  plan: OpusCommanderResponse | null;
  brief: EvacuaBriefingResult | null;
  dynamicSuggestions: DynamicAssistantSuggestion[] | null;
  selectedIncident: FireIncident | null;
  focusedOnPlanIncident: boolean;
  dispatchDisabled: boolean;
  alertDisabled: boolean;
  dispatchSending: boolean;
  alertSending: boolean;
  onFollowUp: (command: string) => void;
  onPlanAction: (action: OpusCommanderAction) => void;
}): AssistantSuggestion[] {
  const incidentName = selectedIncident?.name ?? plan?.incidentName ?? brief?.incidentName ?? "the highest impact fire";

  if (plan?.recommendedActions.length) {
    return plan.recommendedActions.slice(0, 3).map((action) => {
      const Icon = actionIcons[action.type];
      const executable = action.type === "dispatch" || action.type === "alert" || !focusedOnPlanIncident;
      const disabled = focusedOnPlanIncident && (action.type === "dispatch" ? dispatchDisabled : action.type === "alert" ? alertDisabled : false);
      const busy = action.type === "dispatch" ? dispatchSending : action.type === "alert" ? alertSending : false;

      return {
        id: action.id,
        title: !focusedOnPlanIncident
          ? "Focus incident"
          : action.type === "dispatch"
            ? "Approve dispatch"
            : action.type === "alert"
              ? "Prepare alert"
              : action.title,
        description: action.rationale,
        icon: Icon,
        tone: action.type === "alert" ? "ember" : action.type === "evacuation" ? "red" : action.type === "dispatch" ? "cyan" : "muted",
        disabled,
        busy,
        approval: action.requiresApproval,
        onClick: () => {
          if (executable) {
            onPlanAction(action);
            return;
          }
          onFollowUp(`Expand the recommended action "${action.title}" for ${incidentName}. Include next operator steps.`);
        },
      };
    });
  }

  if (dynamicSuggestions?.length) {
    return dynamicSuggestions.slice(0, 3).map((suggestion) => ({
      id: suggestion.id,
      title: suggestion.title,
      description: suggestion.description,
      icon: suggestionIcons[suggestion.icon] ?? Sparkles,
      tone: suggestion.tone,
      onClick: () => onFollowUp(suggestion.command),
    }));
  }

  if (brief) {
    return [
      {
        id: "brief-plan",
        title: "Create plan",
        description: `Turn this brief into an approval-gated response plan for ${incidentName}.`,
        icon: Sparkles,
        tone: "cyan",
        onClick: () => onFollowUp(`Create an approval-gated response plan for ${incidentName}.`),
      },
      {
        id: "brief-alert",
        title: "Draft alert",
        description: "Prepare alert language for operator review without sending it.",
        icon: Send,
        tone: "ember",
        onClick: () => onFollowUp(`Prepare alert guidance for ${incidentName}; do not send it.`),
      },
      {
        id: "brief-watch",
        title: "Watch next",
        description: "Ask Evacua what changed and what needs attention next.",
        icon: Radio,
        tone: "muted",
        onClick: () => onFollowUp(`What should I watch next for ${incidentName}?`),
      },
    ];
  }

  return [
    {
      id: "quick-brief",
      title: "Situation brief",
      description: `Summarize current risk, responders, routes, and next move for ${incidentName}.`,
      icon: ClipboardList,
      tone: "cyan",
      onClick: () => onFollowUp(`Give me a concise status brief for ${incidentName}.`),
    },
    {
      id: "quick-plan",
      title: "Autonomous mission",
      description: "Triage fires, draft dispatch workflow, and queue approvals.",
      icon: BrainCircuit,
      tone: "ember",
      onClick: () =>
        onFollowUp(
          `Run an autonomous fire mission for ${incidentName}. Triage active incidents, prepare dispatch workflow, routes, evacuation notes, and approval-gated alerts.`,
        ),
    },
    {
      id: "quick-watch",
      title: "Watch next",
      description: "Identify the next signal Evacua should monitor.",
      icon: Radio,
      tone: "muted",
      onClick: () => onFollowUp(`What should I watch next for ${incidentName}?`),
    },
  ];
}

function VoiceOrb({
  mode,
  volumeLevel,
  onToggleVoice,
  compact = false,
  interactive = true,
}: {
  mode: "idle" | "listening" | "speaking" | "thinking";
  volumeLevel: number;
  onToggleVoice: () => void;
  compact?: boolean;
  interactive?: boolean;
}) {
  const active = mode !== "idle";
  const speaking = mode === "speaking";
  const thinking = mode === "thinking";
  const listening = mode === "listening";
  const intensity = Math.max(0.12, Math.min(volumeLevel / 100, 1));
  const pulseScale = 1 + intensity * (speaking ? 0.2 : listening ? 0.14 : 0.08);
  const statusLabel = speaking ? "speaking" : thinking ? "thinking" : listening ? "listening" : "tap to talk";
  const volumeMotion = useMotionValue(intensity);
  const springVolume = useSpring(volumeMotion, { stiffness: 220, damping: 24, mass: 0.7 });
  const reactiveAuraScale = useTransform(springVolume, [0, 1], [0.94, speaking ? 1.22 : listening ? 1.16 : 1.08]);
  const reactiveAuraOpacity = useTransform(springVolume, [0, 1], [0.2, speaking ? 0.95 : 0.78]);
  const reactiveWaveWidth = useTransform(springVolume, [0, 1], [2.4, speaking ? 6 : 4.5]);
  const reactiveWaveGlow = useTransform(springVolume, [0, 1], [
    "drop-shadow(0 0 4px rgba(114,231,255,0.25))",
    speaking
      ? "drop-shadow(0 0 18px rgba(255,158,61,0.78))"
      : "drop-shadow(0 0 16px rgba(114,231,255,0.72))",
  ]);

  useEffect(() => {
    volumeMotion.set(intensity);
  }, [intensity, volumeMotion]);

  const waveformBars = [
    7, 12, 18, 25, 16, 10, 22, 34, 42, 30, 20, 14, 24, 36, 28, 18, 10,
  ].map((base, index) => {
    const voiceLift = base + intensity * (speaking ? 34 : listening ? 24 : thinking ? 16 : 6);
    const idleLift = 4 + (index % 3) * 2;
    return {
      x: 18 + index * 11.5,
      idle: idleLift,
      low: Math.max(6, voiceLift * 0.45),
      high: voiceLift,
      delay: index * 0.035,
    };
  });

  const orbClassName = cn(
    "group relative flex shrink-0 items-center justify-center rounded-full outline-none transition-transform duration-300 ease-[var(--ease-premium)] hover:scale-[1.015] focus-visible:ring-2 focus-visible:ring-[var(--color-cyan)]/60 active:scale-[0.985]",
    compact ? "size-[64px]" : "size-[172px] 2xl:size-[202px]",
    !interactive && "pointer-events-none",
  );

  return interactive ? (
    <button
      type="button"
      onClick={onToggleVoice}
      aria-label={mode === "idle" ? "Start voice session" : "Stop voice session"}
      className={orbClassName}
    >
      <VoiceOrbBody
        active={active}
        compact={compact}
        intensity={intensity}
        listening={listening}
        pulseScale={pulseScale}
        reactiveAuraOpacity={reactiveAuraOpacity}
        reactiveAuraScale={reactiveAuraScale}
        reactiveWaveGlow={reactiveWaveGlow}
        reactiveWaveWidth={reactiveWaveWidth}
        speaking={speaking}
        statusLabel={statusLabel}
        thinking={thinking}
        waveformBars={waveformBars}
      />
    </button>
  ) : (
    <div className={orbClassName} aria-hidden="true">
      <VoiceOrbBody
        active={active}
        compact={compact}
        intensity={intensity}
        listening={listening}
        pulseScale={pulseScale}
        reactiveAuraOpacity={reactiveAuraOpacity}
        reactiveAuraScale={reactiveAuraScale}
        reactiveWaveGlow={reactiveWaveGlow}
        reactiveWaveWidth={reactiveWaveWidth}
        speaking={speaking}
        statusLabel={statusLabel}
        thinking={thinking}
        waveformBars={waveformBars}
      />
    </div>
  );
}

function VoiceOrbBody({
  active,
  compact,
  intensity,
  listening,
  pulseScale,
  reactiveAuraOpacity,
  reactiveAuraScale,
  reactiveWaveGlow,
  reactiveWaveWidth,
  speaking,
  statusLabel,
  thinking,
  waveformBars,
}: {
  active: boolean;
  compact: boolean;
  intensity: number;
  listening: boolean;
  pulseScale: number;
  reactiveAuraOpacity: MotionValue<number>;
  reactiveAuraScale: MotionValue<number>;
  reactiveWaveGlow: MotionValue<string>;
  reactiveWaveWidth: MotionValue<number>;
  speaking: boolean;
  statusLabel: string;
  thinking: boolean;
  waveformBars: Array<{ x: number; idle: number; low: number; high: number; delay: number }>;
}) {
  return (
    <>
      <motion.span
        className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(85,181,217,0.18),transparent_62%)] blur-2xl"
        style={{ opacity: reactiveAuraOpacity, scale: reactiveAuraScale }}
      />
      <motion.div
        className={cn(
          "pointer-events-none absolute rounded-full border",
          compact ? "inset-1.5" : "inset-4",
          speaking ? "border-[var(--color-ember)]/20" : "border-[var(--color-cyan)]/20",
        )}
        style={{ scale: reactiveAuraScale, opacity: reactiveAuraOpacity }}
      />
      <motion.div
        className={cn(
          "absolute rounded-full border blur-[1px]",
          compact ? "inset-2.5" : "inset-5",
          speaking
            ? "border-[var(--color-ember)]/45 bg-[var(--color-ember-soft)]/18"
            : thinking
              ? "border-white/[0.16] bg-white/[0.04]"
              : "border-[var(--color-cyan)]/35 bg-[var(--color-cyan-soft)]/16",
        )}
        animate={{
          scale: active ? [1, pulseScale, 1] : [0.98, 1.02, 0.98],
          opacity: active ? [0.42, 0.9, 0.42] : [0.22, 0.38, 0.22],
        }}
        transition={{ duration: speaking ? 0.9 : listening ? 1.25 : 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className={cn(
          "absolute rounded-[43%_57%_50%_50%/50%_42%_58%_50%] opacity-90 blur-md",
          compact ? "inset-4" : "inset-6 2xl:inset-7",
          speaking
            ? "bg-[conic-gradient(from_80deg,rgba(255,158,61,0.12),rgba(255,158,61,0.78),rgba(226,86,86,0.36),rgba(114,231,255,0.48),rgba(255,158,61,0.12))]"
            : "bg-[conic-gradient(from_140deg,rgba(85,181,217,0.08),rgba(114,231,255,0.72),rgba(85,181,217,0.48),rgba(255,158,61,0.22),rgba(85,181,217,0.08))]",
        )}
        animate={{
          rotate: active ? 360 : 90,
          borderRadius: active
            ? [
                "43% 57% 50% 50% / 50% 42% 58% 50%",
                "58% 42% 44% 56% / 45% 60% 40% 55%",
                "48% 52% 60% 40% / 58% 43% 57% 42%",
                "43% 57% 50% 50% / 50% 42% 58% 50%",
              ]
            : "50% 50% 50% 50% / 50% 50% 50% 50%",
          scale: active ? [1, 1 + intensity * 0.12, 0.96 + intensity * 0.06, 1] : 1,
        }}
        transition={{
          rotate: { duration: thinking ? 3.8 : speaking ? 5.5 : 10, repeat: Infinity, ease: "linear" },
          borderRadius: { duration: speaking ? 2.2 : 4.8, repeat: Infinity, ease: "easeInOut" },
          scale: { duration: speaking ? 0.8 : 1.6, repeat: Infinity, ease: "easeInOut" },
        }}
      />
      <motion.div
        className={cn(
          "absolute rounded-[48%_52%_58%_42%/45%_58%_42%_55%] border border-white/[0.09] shadow-[inset_0_0_42px_rgba(85,181,217,0.24),0_0_70px_-24px_rgba(85,181,217,0.9)]",
          compact ? "inset-[18px]" : "inset-[46px] 2xl:inset-[54px]",
          speaking
            ? "bg-[radial-gradient(circle_at_64%_44%,rgba(255,158,61,0.5),transparent_18%),radial-gradient(circle_at_35%_35%,rgba(114,231,255,0.32),transparent_28%),rgba(5,5,6,0.78)]"
            : "bg-[radial-gradient(circle_at_35%_30%,rgba(114,231,255,0.44),transparent_26%),radial-gradient(circle_at_70%_68%,rgba(255,158,61,0.18),transparent_32%),rgba(5,5,6,0.78)]",
        )}
        animate={{
          borderRadius: active
            ? [
                "48% 52% 58% 42% / 45% 58% 42% 55%",
                "60% 40% 47% 53% / 52% 40% 60% 48%",
                "42% 58% 54% 46% / 62% 45% 55% 38%",
                "48% 52% 58% 42% / 45% 58% 42% 55%",
              ]
            : "50% 50% 50% 50% / 50% 50% 50% 50%",
          x: active ? [0, -4 * intensity, 5 * intensity, 0] : 0,
          y: active ? [0, 5 * intensity, -4 * intensity, 0] : 0,
          scale: speaking ? [1, 1.08 + intensity * 0.08, 0.98, 1.05] : listening ? [1, pulseScale, 1] : thinking ? [1, 1.05, 1] : 1,
        }}
        transition={{ duration: speaking ? 1.1 : listening ? 1.4 : 3.4, repeat: active ? Infinity : 0, ease: "easeInOut" }}
      />
      <div className={cn("pointer-events-none absolute rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.18),transparent_58%)] blur-xl", compact ? "inset-[24px]" : "inset-[62px] 2xl:inset-[72px]")} />

      <svg className={cn("relative z-10 overflow-visible opacity-95", compact ? "h-9 w-14" : "h-24 w-36 2xl:h-28 2xl:w-40")} viewBox="0 0 220 110" role="img" aria-label="Evacua voice waveform">
        <motion.line
          x1="10"
          x2="210"
          y1="55"
          y2="55"
          stroke="rgba(255,255,255,0.16)"
          strokeLinecap="round"
          strokeWidth="1.5"
          initial={{ opacity: active ? 0.2 : 0.18 }}
          animate={{ opacity: active ? [0.2, 0.46, 0.2] : 0.18 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.g style={{ filter: reactiveWaveGlow }}>
          {waveformBars.map((bar, index) => {
            const idle = Number.isFinite(bar.idle) ? bar.idle : 6;
            const low = Number.isFinite(bar.low) ? bar.low : idle;
            const high = Number.isFinite(bar.high) ? bar.high : idle * 1.6;
            return (
              <motion.line
                key={`${bar.x}-${index}`}
                x1={bar.x}
                x2={bar.x}
                y1={55 - idle}
                y2={55 + idle}
                stroke={speaking && index % 4 === 0 ? "rgba(255,158,61,0.96)" : index % 3 === 0 ? "rgba(245,176,65,0.72)" : "rgba(114,231,255,0.92)"}
                strokeLinecap="round"
                style={{ strokeWidth: reactiveWaveWidth }}
                animate={{
                  y1: active
                    ? [55 - low, 55 - high, 55 - low * 0.75, 55 - high * 0.62]
                    : [55 - idle, 55 - idle * 1.6, 55 - idle],
                  y2: active
                    ? [55 + low, 55 + high, 55 + low * 0.75, 55 + high * 0.62]
                    : [55 + idle, 55 + idle * 1.6, 55 + idle],
                  opacity: active ? [0.48, 1, 0.64, 0.92] : [0.24, 0.44, 0.24],
                }}
                transition={{
                  duration: speaking ? 0.55 : listening ? 0.72 : 1.8,
                  repeat: Infinity,
                  delay: Number.isFinite(bar.delay) ? bar.delay : 0,
                  ease: "easeInOut",
                }}
              />
            );
          })}
        </motion.g>
        <motion.path
          d="M14 55 C 42 49, 56 62, 82 55 S 124 46, 150 55 S 184 64, 206 53"
          fill="none"
          stroke="rgba(255,255,255,0.24)"
          strokeLinecap="round"
          strokeWidth="1"
          initial={{ opacity: active ? 0.12 : 0.1 }}
          animate={{ opacity: active ? [0.12, 0.34, 0.12] : 0.1 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>

      {!compact && (
        <motion.div
          className="absolute bottom-5 z-10 flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/55 px-3 py-1.5 font-mono text-[9px] uppercase text-[var(--color-text-muted)] shadow-2xl backdrop-blur-xl 2xl:bottom-7"
          animate={{ y: active ? [0, -2, 0] : 0 }}
          transition={{ duration: 1.6, repeat: active ? Infinity : 0, ease: "easeInOut" }}
        >
          <span className={cn("size-1.5 rounded-full", active ? "bg-[var(--color-cyan)] shadow-[0_0_12px_rgba(85,181,217,0.9)]" : "bg-white/25")} />
          {statusLabel}
        </motion.div>
      )}
    </>
  );
}

function AssistantSuggestedActions({
  actions,
  busy,
  compact = false,
  title = "Suggested next moves",
  hint = "tap or say approve",
}: {
  actions: AssistantSuggestion[];
  busy: boolean;
  compact?: boolean;
  title?: string;
  hint?: string;
}) {
  return (
    <div className="shrink-0">
      {!compact && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
            <Sparkles className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
            {title}
          </span>
          <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">{hint}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2">
        {actions.map((action) => (
          <SuggestedActionButton key={action.id} action={action} disabled={busy || action.disabled} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function SuggestedActionButton({
  action,
  disabled,
  compact = false,
}: {
  action: AssistantSuggestion;
  disabled?: boolean;
  compact?: boolean;
}) {
  const Icon = action.icon;
  const toneClass =
    action.tone === "cyan"
      ? "border-[var(--color-cyan)]/22 bg-[var(--color-cyan-soft)]/12 hover:border-[var(--color-cyan)]/40"
      : action.tone === "ember"
        ? "border-[var(--color-ember)]/24 bg-[var(--color-ember-soft)]/14 hover:border-[var(--color-ember)]/42"
        : action.tone === "red"
          ? "border-[var(--color-red)]/24 bg-[var(--color-red-soft)]/14 hover:border-[var(--color-red)]/42"
          : "border-white/[0.08] bg-white/[0.035] hover:border-white/[0.14]";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0"
    >
      <Button
        type="button"
        disabled={disabled}
        onClick={action.onClick}
        variant="glass"
        size="sm"
        className={cn(
          "group h-auto w-full justify-start rounded-xl border px-2.5 py-2.5 text-left transition-[border-color,background-color,transform,opacity] duration-200 ease-[var(--ease-premium)]",
          compact ? "min-h-[52px]" : "min-h-[56px]",
          "disabled:pointer-events-none disabled:opacity-45 active:scale-[0.99]",
          toneClass,
        )}
      >
      <span className="flex h-full w-full items-center gap-2">
        <div className={cn("flex items-center justify-between gap-2", compact && "shrink-0")}>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-black/32">
          {action.busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-cyan)]" />
          ) : (
            <Icon className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
          )}
          </div>
          {action.approval && (
            <span className="rounded-md border border-white/[0.08] bg-black/25 px-1.5 py-0.5 font-mono text-[8px] uppercase text-[var(--color-text-muted)]">
              gate
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-white">{action.title}</p>
          <p className="mt-0.5 line-clamp-1 text-[10px] leading-relaxed text-[var(--color-text-muted)]">{action.description}</p>
        </div>
      </span>
      </Button>
    </motion.div>
  );
}

function AssistantActivityFeed({
  items,
  dispatchStatus,
  alertStatus,
  latestOperator,
  latestAssistant,
}: {
  items: Array<{ id: string; label: string; detail: string; status: string }>;
  dispatchStatus: string | null;
  alertStatus: string | null;
  latestOperator?: VapiMessage;
  latestAssistant?: VapiMessage;
}) {
  const hasUpdates = items.length > 0 || dispatchStatus || alertStatus || latestOperator || latestAssistant;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/22 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
          <Activity className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
          Live updates
        </span>
        <Badge variant="secondary" className="font-mono text-[9px] uppercase">
          {hasUpdates ? "active" : "ready"}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        {dispatchStatus && <StatusNotice tone={dispatchStatus.startsWith("Success") ? "success" : "danger"}>{dispatchStatus}</StatusNotice>}
        {alertStatus && <StatusNotice tone={/^(Success|Prepared)/.test(alertStatus) ? "success" : "danger"}>{alertStatus}</StatusNotice>}

        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.id} className="grid grid-cols-[14px_1fr] gap-2 rounded-lg border border-white/[0.06] bg-black/20 p-2">
              <div className="flex justify-center pt-1">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    item.status === "running"
                      ? "animate-ember-pulse bg-[var(--color-cyan)]"
                      : item.status === "failed"
                        ? "bg-[var(--color-red)]"
                        : "bg-white/45",
                  )}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-white">{item.label}</p>
                  <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">{item.status}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{item.detail}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/16 px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
            No active task. Evacua will show approvals, agent trace steps, and voice responses here.
          </div>
        )}

        {(latestOperator || latestAssistant) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {latestOperator && <ConversationPreview label="Last operator" message={latestOperator} />}
            {latestAssistant && <ConversationPreview label="Last Evacua" message={latestAssistant} />}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationPreview({ label, message }: { label: string; message: VapiMessage }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/18 px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">{label}</span>
        {message.timestamp && <span className="font-mono text-[9px] text-[var(--color-text-muted)]">{message.timestamp}</span>}
      </div>
      <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">{messageContent(message)}</p>
    </div>
  );
}

function AssistantBriefSurface({
  brief,
  onFollowUp,
}: {
  brief: EvacuaBriefingResult;
  onFollowUp: (command: string) => void;
}) {
  const incidentName = brief.incidentName ?? "the current incident";
  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-cyan)]/18 bg-[var(--color-cyan-soft)]/8 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <ClipboardList className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
            Current brief
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-white">{brief.incidentName ?? "Operations brief"}</p>
        </div>
        {typeof brief.confidence === "number" && (
          <span className="rounded-md border border-white/[0.08] bg-black/25 px-2 py-1 font-mono text-[10px] uppercase text-[var(--color-text-muted)]">
            {Math.round(brief.confidence * 100)}%
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">{brief.brief}</p>

      {brief.operatorChecklist && brief.operatorChecklist.length > 0 && (
        <div className="grid gap-1.5">
          {brief.operatorChecklist.slice(0, 3).map((item) => (
            <div key={item} className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-black/18 px-3 py-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-cyan)]" strokeWidth={1.75} />
              <span className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">{item}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant="cyan"
          className="h-8 px-3 text-[12px]"
          onClick={() => onFollowUp(`Create an approval-gated response plan for ${incidentName}.`)}
        >
          <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
          Create plan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="glass"
          className="h-8 px-3 text-[12px]"
          onClick={() => onFollowUp(`Prepare alert guidance for ${incidentName}; do not send it.`)}
        >
          <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
          Alert guidance
        </Button>
      </div>

      {brief.incidentBriefMarkdown && (
        <details className="rounded-lg border border-white/[0.08] bg-black/24 p-3">
          <summary className="cursor-pointer text-[10px] uppercase text-[var(--color-text-muted)]">
            Incident report
          </summary>
          <pre className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
            {brief.incidentBriefMarkdown}
          </pre>
        </details>
      )}
    </div>
  );
}

function AssistantPlanSurface({
  plan,
  run,
  loading,
  incidentMismatch,
  dispatchDisabled,
  alertDisabled,
  onAction,
}: {
  plan: OpusCommanderResponse | null;
  run: EvacuaAgentRun | null;
  loading: boolean;
  incidentMismatch: boolean;
  dispatchDisabled: boolean;
  alertDisabled: boolean;
  onAction: (action: OpusCommanderAction) => void;
}) {
  if (loading && !plan) {
    return (
      <div className="rounded-lg border border-[var(--color-cyan)]/20 bg-[var(--color-cyan-soft)]/10 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-cyan)]" />
          Running autonomous fire mission
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Evacua is triaging active fires, drafting dispatch workflow, and holding live actions for operator approval.
        </p>
      </div>
    );
  }

  if (!plan) return null;

  if (run?.autonomousMission) {
    const approvalActions = plan.recommendedActions.filter((action) => action.requiresApproval);
    return (
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
        }}
        className="space-y-3 rounded-xl border border-white/[0.08] bg-black/18 p-3"
      >
        <AutonomousMissionPanel run={run} riskLevel={plan.riskLevel} summary={plan.summary} />

        {approvalActions.length > 0 && (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
            className="rounded-lg border border-[var(--color-amber)]/20 bg-[var(--color-amber-soft)]/8 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-amber)]" strokeWidth={1.75} />
                Operator approvals
              </span>
              <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">
                {approvalActions.length} queued
              </span>
            </div>
            <div className="space-y-2">
              {approvalActions.map((action, index) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.18 + index * 0.08, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <AssistantActionCard
                    action={action}
                    incidentMismatch={incidentMismatch}
                    dispatchDisabled={dispatchDisabled}
                    alertDisabled={alertDisabled}
                    onAction={onAction}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
          <MissionArtifactsDrawer plan={plan} run={run} />
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/[0.08] bg-black/18 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
            Active plan
          </div>
          <p className="mt-1 text-sm font-semibold text-white">{plan.incidentName ?? "Incident plan"}</p>
        </div>
        <span className={cn("rounded-md border px-2 py-1 font-mono text-[10px] uppercase", riskStyles[plan.riskLevel])}>
          {plan.riskLevel}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <AssistantCompareCell label="Baseline" value={plan.heuristicSummary ?? "Rule baseline unavailable."} />
        <AssistantCompareCell label="Evacua" value={plan.summary} highlight />
      </div>

      {run?.autonomousMission && <AutonomousMissionPanel run={run} />}

      {run?.digitalTwin && <DigitalTwinReplay run={run} />}

      <div className="space-y-2">
        {plan.recommendedActions.map((action) => (
          <AssistantActionCard
            key={action.id}
            action={action}
            incidentMismatch={incidentMismatch}
            dispatchDisabled={dispatchDisabled}
            alertDisabled={alertDisabled}
            onAction={onAction}
          />
        ))}
      </div>

      {plan.agentHandoffs && plan.agentHandoffs.length > 0 && (
        <div className="rounded-lg border border-white/[0.07] bg-black/22 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <ClipboardList className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
            Role handoff
          </div>
          <div className="grid gap-2">
            {plan.agentHandoffs.map((handoff) => (
              <AssistantHandoffCard key={`${handoff.role}-${handoff.objective}`} handoff={handoff} />
            ))}
          </div>
        </div>
      )}

      {plan.alertDraft && (
        <div className="rounded-lg border border-white/[0.08] bg-black/30 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <Send className="h-3.5 w-3.5 text-[var(--color-ember)]" strokeWidth={1.75} />
            Alert draft
          </div>
          <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
            {plan.alertDraft}
          </pre>
        </div>
      )}

      {run && <RunTimelineDrawer run={run} />}
      {!run && <AssistantTrace trace={plan.toolTrace} />}

      {plan.incidentBriefMarkdown && (
        <details className="rounded-lg border border-white/[0.08] bg-black/24 p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <FileText className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
            ICS-201 brief export
          </summary>
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
            {plan.incidentBriefMarkdown}
          </pre>
        </details>
      )}
    </div>
  );
}

function AssistantCompareCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-[96px] rounded-lg border p-3",
        highlight
          ? "border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/12"
          : "border-white/[0.07] bg-black/22",
      )}
    >
      <div className="mb-2 font-mono text-[10px] uppercase text-[var(--color-text-muted)]">{label}</div>
      <p className="line-clamp-4 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">{value}</p>
    </div>
  );
}

function MissionArtifactsDrawer({
  plan,
  run,
}: {
  plan: OpusCommanderResponse;
  run: EvacuaAgentRun;
}) {
  return (
    <details className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-left">
        <span className="inline-flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
          <FileText className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
          Detailed artifacts
        </span>
        <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">brief, replay, trace</span>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-1 gap-2">
          <AssistantCompareCell label="Baseline" value={plan.heuristicSummary ?? "Rule baseline unavailable."} />
          <AssistantCompareCell label="Evacua" value={plan.summary} highlight />
        </div>

        <DigitalTwinReplay run={run} />

        {plan.agentHandoffs && plan.agentHandoffs.length > 0 && (
          <div className="rounded-lg border border-white/[0.07] bg-black/22 p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
              <ClipboardList className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
              Role handoff
            </div>
            <div className="grid gap-2">
              {plan.agentHandoffs.map((handoff) => (
                <AssistantHandoffCard key={`${handoff.role}-${handoff.objective}`} handoff={handoff} />
              ))}
            </div>
          </div>
        )}

        {plan.alertDraft && (
          <div className="rounded-lg border border-white/[0.08] bg-black/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
              <Send className="h-3.5 w-3.5 text-[var(--color-ember)]" strokeWidth={1.75} />
              Alert draft
            </div>
            <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
              {plan.alertDraft}
            </pre>
          </div>
        )}

        <RunTimelineDrawer run={run} />

        {plan.incidentBriefMarkdown && (
          <details className="rounded-lg border border-white/[0.08] bg-black/24 p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
              <FileText className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
              ICS-201 brief export
            </summary>
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
              {plan.incidentBriefMarkdown}
            </pre>
          </details>
        )}
      </div>
    </details>
  );
}

const missionRoleIcons: Record<EvacuaAgentTask["role"], React.ElementType> = {
  command: Siren,
  operations: Truck,
  planning: ClipboardList,
  logistics: Route,
  communications: Send,
  safety: ShieldCheck,
};

function missionStatusClass(status: EvacuaMissionStatus) {
  if (status === "complete") return "border-[var(--color-cyan)]/24 bg-[var(--color-cyan-soft)]/12 text-[var(--color-cyan)]";
  if (status === "approval_required") return "border-[var(--color-amber)]/24 bg-[var(--color-amber-soft)]/14 text-[var(--color-amber)]";
  if (status === "blocked") return "border-[var(--color-red)]/24 bg-[var(--color-red-soft)]/14 text-[var(--color-red)]";
  return "border-white/[0.1] bg-white/[0.04] text-[var(--color-text-secondary)]";
}

type EvacuaMissionStatus = EvacuaAgentTask["status"];

function MissionStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "ember";
}) {
  const color =
    tone === "cyan" ? "text-[var(--color-cyan)]" : tone === "amber" ? "text-[var(--color-amber)]" : "text-[var(--color-ember)]";
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/22 px-2 py-2 text-center">
      <p className={cn("font-mono text-lg tabular-nums", color)}>{value}</p>
      <p className="mt-0.5 truncate text-[9px] uppercase text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

function AutonomousMissionPanel({
  run,
  riskLevel,
  summary,
}: {
  run: EvacuaAgentRun;
  riskLevel?: OpusCommanderRiskLevel;
  summary?: string;
}) {
  const mission = run.autonomousMission;
  if (!mission) return null;

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } },
      }}
      className="space-y-3 rounded-lg border border-[var(--color-cyan)]/18 bg-[var(--color-cyan-soft)]/8 p-3"
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <BrainCircuit className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
            Mission control
          </div>
          <p className="mt-1 text-sm font-semibold text-white">{mission.selectedIncidentName}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{summary ?? mission.summary}</p>
        </div>
        {riskLevel ? (
          <span className={cn("shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase", riskStyles[riskLevel])}>
            {riskLevel}
          </span>
        ) : (
          <span className="shrink-0 rounded-md border border-white/[0.08] bg-black/28 px-2 py-1 font-mono text-[9px] uppercase text-[var(--color-text-muted)]">
            autonomous
          </span>
        )}
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="grid grid-cols-3 gap-2">
        <MissionStat label="incidents" value={mission.triage.length} tone="cyan" />
        <MissionStat label="approval gates" value={mission.approvalQueue.length} tone="amber" />
        <MissionStat label="role passes" value={mission.tasks.length} tone="ember" />
      </motion.div>

      <div className="grid gap-2">
        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="rounded-lg border border-white/[0.07] bg-black/22 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
              <Radio className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
              Dispatch workflow
            </span>
            <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">
              initial report to approval
            </span>
          </div>
          <div className="space-y-1.5">
            {mission.dispatchWorkflow.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18 + index * 0.05, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="grid grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md border border-white/[0.06] bg-black/18 px-2 py-1.5"
              >
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[8px]", missionStatusClass(step.status))}>
                  {index + 1}
                </span>
                <div>
                  <p className="text-[11px] font-medium text-white">{step.label}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] leading-relaxed text-[var(--color-text-muted)]">{step.detail}</p>
                </div>
                <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase", missionStatusClass(step.status))}>
                  {step.status === "approval_required" ? "gate" : step.status}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="grid grid-cols-2 gap-2">
          {mission.triage.slice(0, 2).map((item, index) => (
            <motion.div
              key={item.incidentId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42 + index * 0.08, duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-lg border border-white/[0.07] bg-black/22 p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] uppercase text-[var(--color-cyan)]">#{item.rank}</span>
                <span className="font-mono text-[8px] uppercase text-[var(--color-text-muted)]">{item.priority}</span>
              </div>
              <p className="mt-1 truncate text-[11px] font-medium text-white">{item.incidentName}</p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--color-text-muted)]">{item.rationale}</p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} className="rounded-lg border border-white/[0.07] bg-black/22 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <ClipboardList className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
            ICS role passes
          </div>
          <div className="grid grid-cols-2 gap-1.5">
          {mission.tasks.map((task, index) => {
            const Icon = missionRoleIcons[task.role];
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.54 + index * 0.05, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-md border border-white/[0.06] bg-black/18 p-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-black/30">
                    <Icon className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[9px] uppercase text-[var(--color-cyan)]">{task.role}</p>
                    <p className="truncate text-[10px] text-[var(--color-text-muted)]">{task.title}</p>
                  </div>
                </div>
                <span className={cn("mt-1.5 inline-flex rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase", missionStatusClass(task.status))}>
                  {task.status.replaceAll("_", " ")}
                </span>
              </motion.div>
            );
          })}
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}

function DigitalTwinReplay({ run }: { run: EvacuaAgentRun }) {
  const rows = [
    ["Posture", run.digitalTwin.before.posture, run.digitalTwin.after.posture],
    ["Responder staging", run.digitalTwin.before.responderStaging, run.digitalTwin.after.responderStaging],
    ["Route concern", run.digitalTwin.before.routeConcern, run.digitalTwin.after.routeConcern],
    ["Evac buffer", run.digitalTwin.before.evacuationBuffer, run.digitalTwin.after.evacuationBuffer],
    ["Alert state", run.digitalTwin.before.alertState, run.digitalTwin.after.alertState],
  ];

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/22 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
          <RotateCcw className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
          Digital twin replay
        </span>
        <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">before - after</span>
      </div>
      <div className="space-y-2">
        {rows.slice(0, 4).map(([label, before, after]) => (
          <div key={label} className="grid grid-cols-[74px_1fr_1fr] gap-2 rounded-lg border border-white/[0.06] bg-black/20 p-2">
            <span className="text-[10px] uppercase text-[var(--color-text-muted)]">{label}</span>
            <p className="line-clamp-2 text-[10px] leading-relaxed text-[var(--color-text-muted)]">{before}</p>
            <p className="line-clamp-2 text-[10px] leading-relaxed text-[var(--color-text-secondary)]">{after}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunTimelineDrawer({ run }: { run: EvacuaAgentRun }) {
  return (
    <details className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-left">
        <span className="inline-flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
          Run timeline
        </span>
        <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">{run.status}</span>
      </summary>
      <div className="mt-3 space-y-3">
        <AssistantTrace trace={run.trace} />
        <div className="rounded-lg border border-white/[0.07] bg-black/22 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
            Safety reviewer
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">{run.safetyReview.summary}</p>
          <div className="mt-2 grid gap-1.5">
            {run.safetyReview.flags.slice(0, 3).map((flag) => (
              <div key={flag} className="rounded-md border border-white/[0.06] bg-black/18 px-2 py-1.5 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
                {flag}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-2">
          {run.findings.slice(0, 4).map((finding) => (
            <div key={`${finding.role}-${finding.title}`} className="rounded-lg border border-white/[0.07] bg-black/22 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase text-[var(--color-cyan)]">
                  {finding.role.replaceAll("_", " ")}
                </span>
                <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">{finding.severity}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-white">{finding.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{finding.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function AssistantActionCard({
  action,
  incidentMismatch,
  dispatchDisabled,
  alertDisabled,
  onAction,
}: {
  action: OpusCommanderAction;
  incidentMismatch: boolean;
  dispatchDisabled: boolean;
  alertDisabled: boolean;
  onAction: (action: OpusCommanderAction) => void;
}) {
  const Icon = actionIcons[action.type];
  const actionable = action.type === "dispatch" || action.type === "alert";
  const disabled =
    !incidentMismatch &&
    (action.type === "dispatch" ? dispatchDisabled : action.type === "alert" ? alertDisabled : false);

  return (
    <div className={cn("rounded-lg border p-3", actionTone[action.type])}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-black/30">
          <Icon className="h-4 w-4 text-[var(--color-cyan)]" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white">{action.title}</p>
            {action.requiresApproval && (
              <span className="rounded-md border border-white/[0.08] bg-black/25 px-2 py-1 font-mono text-[9px] uppercase text-[var(--color-text-muted)]">
                Approval
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{action.rationale}</p>
          {(actionable || incidentMismatch) && (
            <Button
              type="button"
              size="sm"
              variant={action.type === "alert" ? "ember" : action.type === "dispatch" ? "cyan" : "glass"}
              className="mt-3 h-8 px-3 text-[12px]"
              disabled={disabled}
              onClick={() => onAction(action)}
            >
              {incidentMismatch
                ? "Focus incident"
                : action.type === "dispatch"
                  ? "Approve dispatch"
                  : action.type === "alert"
                    ? "Approve alert preview"
                    : "Review"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AssistantHandoffCard({ handoff }: { handoff: OpusCommanderHandoff }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/24 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase text-[var(--color-cyan)]">{handoff.role}</span>
        <span className="truncate text-[11px] text-[var(--color-text-muted)]">{handoff.objective}</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">{handoff.recommendation}</p>
    </div>
  );
}

function AssistantTrace({ trace }: { trace: OpusCommanderTraceStep[] }) {
  const [open, setOpen] = useState(false);
  const visible = open ? trace : trace.slice(0, 3);

  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mb-3 flex w-full items-center justify-between gap-2 text-left text-[10px] uppercase text-[var(--color-text-muted)]"
      >
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
          Agent trace
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} strokeWidth={1.75} />
      </button>
      <div className="space-y-3">
        {visible.map((item, index) => (
          <div key={`${item.step}-${index}`} className="grid grid-cols-[14px_1fr] gap-2">
            <div className="relative flex justify-center">
              <span className={cn("mt-0.5 h-2.5 w-2.5 rounded-full border", traceStatusClass(item.status))} />
              {index < visible.length - 1 && <span className="absolute top-4 h-[calc(100%+2px)] w-px bg-white/[0.08]" />}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-white">{item.step}</p>
                <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">{item.status}</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
      {trace.length > 3 && (
        <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
          {open ? "Showing full trace." : `${trace.length - 3} more trace steps hidden.`}
        </p>
      )}
    </div>
  );
}

function EnvironmentalPanel({
  weather,
  loading,
  activeFire,
}: {
  weather: WeatherData | null;
  loading: boolean;
  activeFire: FireStateResponse["fires"][number] | null;
}) {
  const humidity = weather?.humidity ?? null;
  const temp = weather?.temp ?? null;
  const visibility = weather?.visibility ?? null;
  const aqi = weather?.airQuality?.aqi ?? null;
  const growth = activeFire?.growth_rate ?? 0;

  return (
    <Card className="evacua-panel shrink-0">
      <CardHeader className="border-b border-white/[0.07]">
        <PanelHeading icon={Activity} label="Environmental load" value={loading ? "syncing" : weather?.description ?? "standby"} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <WeatherStat icon={Thermometer} label="Temp" value={temp == null ? "—" : `${temp}F`} color={temp == null ? "#8b93a7" : getTempColor(temp)} />
          <WeatherStat icon={Wind} label="Wind" value={weather ? `${weather.wind.speed} ${weather.wind.direction}` : "—"} color="#55b5d9" />
          <WeatherStat icon={ShieldCheck} label="Humidity" value={humidity == null ? "—" : `${humidity}%`} color={humidity == null ? "#8b93a7" : getHumidityColor(humidity)} />
          <WeatherStat icon={Gauge} label="AQI" value={aqi == null ? "—" : getAqiLabel(aqi)} color={aqi == null ? "#8b93a7" : getAqiColor(aqi)} />
        </div>

        {visibility != null && (
          <RiskBar label="Visibility" value={Math.min((visibility / 10) * 100, 100)} caption={getVisLabel(visibility)} color={getVisColor(visibility)} />
        )}
        <RiskBar label="Fire growth" value={Math.min(growth * 4, 100)} caption={growth ? `${Math.round(growth)} m/min` : "Stable"} color={growth > 18 ? "#e25656" : "#ff9e3d"} />
        {!weather && !loading && (
          <p className="text-[10px] leading-relaxed text-[var(--color-text-muted)]">
            Live weather feed unavailable. Readings resume automatically when the upstream reconnects.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function WeatherStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
        <Icon className="h-3 w-3" strokeWidth={1.75} />
        {label}
      </div>
      <p className="mt-1 truncate font-mono text-sm" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function RiskBar({
  label,
  value,
  caption,
  color,
}: {
  label: string;
  value: number;
  caption: string;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase text-[var(--color-text-muted)]">{label}</span>
        <span className="font-mono text-[10px] uppercase" style={{ color }}>
          {caption}
        </span>
      </div>
      <Progress value={value} label={`${label} ${Math.round(value)}%`} className="h-1.5" indicatorClassName="bg-[var(--risk-color)]" style={{ "--risk-color": color } as React.CSSProperties} />
    </div>
  );
}

function AlertPanel({
  selectedIncident,
  alertSending,
  alertStatus,
  onAlert,
}: {
  selectedIncident: FireIncident | null;
  alertSending: boolean;
  alertStatus: string | null;
  onAlert: () => void;
}) {
  return (
    <Card className="evacua-panel shrink-0">
      <CardContent className="space-y-3">
        {alertStatus && (
          <StatusNotice tone={/^(Success|Prepared)/.test(alertStatus) ? "success" : "danger"}>
            {alertStatus}
          </StatusNotice>
        )}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Siren className="h-4 w-4 text-[var(--color-red)]" strokeWidth={1.75} />
              Emergency alert
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {selectedIncident ? selectedIncident.name : "No incident selected"}
            </p>
          </div>
          <Button type="button" variant="danger" disabled={alertSending} onClick={onAlert}>
            <Send className={cn("h-4 w-4", alertSending && "animate-pulse")} strokeWidth={1.75} />
            {alertSending ? "Preparing" : "Prepare"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusNotice({
  tone,
  children,
}: {
  tone: "success" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-3 py-2 text-xs font-medium",
        tone === "success"
          ? "border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/15 text-[var(--color-cyan)]"
          : "border-[var(--color-red)]/25 bg-[var(--color-red-soft)]/20 text-[var(--color-red)]",
      )}
    >
      {children}
    </div>
  );
}

function CommandLens({
  selectedIncident,
  weather,
  fireState,
  responderOps,
}: {
  selectedIncident: FireIncident | null;
  weather: WeatherData | null;
  fireState: FireStateResponse | null;
  responderOps: ResponderStatsResponse | null;
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden w-[280px] rounded-lg border border-white/[0.08] bg-black/65 p-3 shadow-2xl backdrop-blur-xl xl:block">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
          <MapPin className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
          Tactical mesh
        </span>
        <span className="font-mono text-[10px] uppercase text-[var(--color-text-muted)]">
          {fireState?.fires.length ?? 0} fires
        </span>
      </div>
      <div className="evacua-3d-lens">
        <div className="evacua-3d-plane" />
        <div className="evacua-3d-needle" />
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-white/[0.07] rounded-lg border border-white/[0.07] bg-black/30">
        <MiniStat label="Risk" value={selectedIncident?.risk ?? "watch"} />
        <MiniStat label="Wind" value={weather ? `${weather.wind.speed}` : "0"} />
        <MiniStat label="Ready" value={responderOps?.totals.available ?? 0} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="px-2 py-2 text-center">
      <p className="truncate font-mono text-xs text-[var(--color-text-primary)]">{value ?? "na"}</p>
      <p className="mt-0.5 text-[9px] uppercase text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}
