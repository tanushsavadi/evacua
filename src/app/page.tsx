"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AudioLines,
  Bot,
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
  MicOff,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MapPanel } from "@/components/command-center/map-panel";
import { OpsMetric, OpsShellHeader, OpsStatusPill } from "@/components/command-center/ops-shell-header";
import { useVapi, type VapiMessage } from "@/hooks/use-vapi";
import { useWeather, type WeatherData } from "@/hooks/use-weather";
import IncidentsList from "@/components/incidents-list";
import type { FireIncident } from "@/lib/composio-telegram-service";
import { useFireOps, type FireStateResponse, type ResponderStatsResponse } from "@/lib/hooks/use-fire-ops";
import type { LatLng } from "@/lib/geo/types";
import type {
  OpusCommanderAction,
  OpusCommanderActionType,
  OpusCommanderHandoff,
  OpusCommanderResponse,
  OpusCommanderRiskLevel,
  OpusCommanderTraceStep,
} from "@/lib/opus-commander";
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

function commandLooksLikePlanRequest(command: string) {
  return (
    /\b(judge demo|demo script|demo scenario|run demo|start demo)\b/i.test(command) ||
    /\b(dispatch|send team|approve|commander|evacuat|public alert|alert guidance|route advisory|recommend action|action plan|incident action plan)\b/i.test(command) ||
    /\b(create|generate|build|draft|prepare|run|make)\b.*\b(plan|response|incident action|commander|alert|route|evacuat)\b/i.test(command)
  );
}

function commandLooksLikeReportRequest(command: string) {
  return /\b(report|brief|summary|summarize|status|update|situation|what('| i)?s happening|what changed|what matters|watch next|explain|conditions)\b/i.test(command);
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
  alertDraft?: string;
  incidentBriefMarkdown?: string;
};

export default function Dashboard() {
  const [selectedIncident, setSelectedIncident] = useState<FireIncident | null>(null);
  const [alertSending, setAlertSending] = useState(false);
  const [alertStatus, setAlertStatus] = useState<string | null>(null);
  const [dispatchSending, setDispatchSending] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantPlan, setAssistantPlan] = useState<OpusCommanderResponse | null>(null);
  const [assistantBrief, setAssistantBrief] = useState<EvacuaBriefingResult | null>(null);
  const [assistantRun, setAssistantRun] = useState<EvacuaAgentRun | null>(null);
  const [assistantPlanLoading, setAssistantPlanLoading] = useState(false);
  const [assistantPlanError, setAssistantPlanError] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
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

  const handleEmergencyAlert = async () => {
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
        body: JSON.stringify({ incident: selectedIncident }),
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
  };

  const handleDispatchResponder = async () => {
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
    try {
      const res = await fetch("/api/dispatch-responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: selectedIncident.id,
          incidentLat: selectedIncident.lat,
          incidentLon: selectedIncident.lon,
        }),
      });
      const result = await res.json();

      if (result.success) {
        setDispatchStatus(`Success: team ${result.responder.team_number} dispatched.`);
        setTimeout(async () => {
          await refresh();
        }, 800);
      } else {
        setDispatchStatus(`Dispatch failed: ${result.error || "Unknown error"}`);
      }
    } catch {
      setDispatchStatus("Dispatch failed: service unavailable.");
    } finally {
      setDispatchSending(false);
      setTimeout(() => setDispatchStatus(null), 6000);
    }
  };

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

  const handleRunAssistantPlan = useCallback(async ({
    command,
    judgeDemo = false,
  }: {
    command?: string;
    judgeDemo?: boolean;
  } = {}) => {
    setAssistantPlanLoading(true);
    setAssistantPlanError(null);
    try {
      const operatorIntent =
        command?.trim() ||
        [...recentTranscript()].reverse().find((message) => message.role === "user")?.content ||
        "Generate the safest incident action plan for the current disaster context.";
      const targetIncidentId = judgeDemo ? undefined : resolveIncidentIdFromCommand(operatorIntent);

      const res = await fetch("/api/evacua-agent-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: targetIncidentId,
          objective: judgeDemo
            ? "Run the clearest judge demo scenario. Pick the highest-impact active fire and produce an auditable responder action plan."
            : operatorIntent,
          transcriptContext: recentTranscript(operatorIntent),
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
      if (plan.incidentId && plan.incidentId !== selectedIncident?.id) {
        focusIncidentById(plan.incidentId);
      }

      const nextAction = plan.recommendedActions.find((action) => action.type === "dispatch" || action.type === "alert");
      receiveAgentMessage({
        action: "scan",
        message: nextAction
          ? `${plan.incidentName ?? "Incident"} plan ready. Next recommended action: ${nextAction.title}.`
          : `${plan.incidentName ?? "Incident"} plan ready. Review the approval-gated actions.`,
        data: {
          runId: plan.runId,
          incidentId: plan.incidentId,
          riskLevel: plan.riskLevel,
        },
      });
      lastTimestampRef.current = new Date().toISOString();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Plan generation failed";
      setAssistantPlanError(message);
      receiveAgentMessage({
        action: "scan",
        message: `Evacua could not generate a plan: ${message}`,
      });
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
          recentTranscript: transcript,
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
    setAssistantPlanError(null);
    setAssistantPlan(null);
    setAssistantBrief(null);
    setAssistantRun(null);
    try {
      const resetRes = await fetch("/api/demo/reset", { method: "POST" });
      const reset = await resetRes.json();
      if (!resetRes.ok) throw new Error(reset?.error ?? "Demo reset failed");

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
      await handleGenerateEvacuaBrief("Give me the Pine Ridge incident brief for the judge demo.");
      await handleRunAssistantPlan({
        command: "Run the judge demo action plan for Pine Ridge Fire with approval-gated dispatch and alert preview.",
        judgeDemo: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Judge demo failed";
      setAssistantPlanError(message);
      receiveAgentMessage({ action: "scan", message: `Judge demo could not start: ${message}` });
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

    if (commandLooksLikeReportRequest(command) && !commandLooksLikePlanRequest(command)) {
      await handleGenerateEvacuaBrief(command);
      return;
    }

    if (commandLooksLikePlanRequest(command)) {
      await handleRunAssistantPlan({
        command,
        judgeDemo: /\b(judge demo|demo script|demo scenario|run demo|start demo)\b/i.test(command),
      });
      return;
    }

    if (!commandLooksLikeReportRequest(command) && assistantPlan) {
      await handleGenerateEvacuaBrief(`${command}\n\nUse the active plan context if relevant.`);
      return;
    }

    await handleGenerateEvacuaBrief(command);
  }, [assistantPlan, assistantPlanLoading, briefLoading, handleGenerateEvacuaBrief, handleRunAssistantPlan]);

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
    void routeAssistantCommand(command);
  }, [assistantPlanLoading, briefLoading, routeAssistantCommand, vapiMessages]);

  const activeFire = useMemo(
    () => (selectedIncident ? fireState?.fires.find((fire) => fire.id === selectedIncident.id) ?? null : null),
    [fireState?.fires, selectedIncident],
  );
  const totalResponderSignal = responderStats.available + responderStats.dispatched + responderStats.active;
  const riskPosture = selectedIncident?.risk ?? activeFire?.risk_level ?? "watch";

  return (
    <div className="evacua-shell evacua-noise relative min-h-[100dvh] overflow-hidden bg-[var(--color-bg-oled)] text-[var(--color-text-primary)]">
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
            >
              {demoRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Play className="h-4 w-4" strokeWidth={1.75} />
              )}
              Judge demo
            </Button>
            <OpsStatusPill active={Boolean(fireState)} label={fireState ? "Feed active" : "Feed standby"} />
          </>
        }
      />

      <main className="relative z-10 grid gap-3 p-3 lg:h-[calc(100dvh-73px)] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(320px,390px)] lg:overflow-hidden md:p-4">
        <section className="flex min-h-0 flex-col gap-3">
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
            onDispatch={handleDispatchResponder}
          />
        </section>

        <section className="relative min-h-[560px] overflow-hidden rounded-lg border border-white/[0.08] bg-black shadow-[0_30px_120px_-70px_rgba(0,0,0,1)] lg:min-h-0">
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

        <section className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
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
            planError={assistantPlanError}
            selectedIncident={selectedIncident}
            dispatchDisabled={!selectedIncident || responderStats.available === 0 || dispatchSending}
            alertDisabled={!selectedIncident || alertSending}
            onPromptChange={setAssistantPrompt}
            onSubmitPrompt={handleAssistantPromptSubmit}
            onFollowUp={handleAssistantFollowUp}
            onDispatch={handleDispatchResponder}
            onPrepareAlert={handleEmergencyAlert}
            onFocusIncident={focusIncidentById}
          />

          <EnvironmentalPanel
            selectedIncident={selectedIncident}
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
  onDispatch,
}: {
  selectedIncident: FireIncident | null;
  responderStats: { available: number; dispatched: number; active: number; eta?: string };
  dispatchSending: boolean;
  dispatchStatus: string | null;
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
  planError,
  selectedIncident,
  dispatchDisabled,
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
  planError: string | null;
  selectedIncident: FireIncident | null;
  dispatchDisabled: boolean;
  alertDisabled: boolean;
  onPromptChange: (value: string) => void;
  onSubmitPrompt: () => void;
  onFollowUp: (command: string) => void;
  onDispatch: () => void;
  onPrepareAlert: () => void;
  onFocusIncident: (incidentId: string) => void;
}) {
  const busy = briefLoading || planLoading;
  const focusedOnPlanIncident = !plan?.incidentId || selectedIncident?.id === plan.incidentId;

  function handlePlanAction(action: OpusCommanderAction) {
    if (!focusedOnPlanIncident && plan?.incidentId) {
      onFocusIncident(plan.incidentId);
      return;
    }
    if (action.type === "dispatch") onDispatch();
    if (action.type === "alert") onPrepareAlert();
  }

  return (
    <Card className="evacua-panel flex min-h-[500px] flex-1 flex-col overflow-hidden lg:min-h-0">
      <CardHeader className="border-b border-white/[0.07]">
        <div className="flex items-center justify-between gap-3">
          <PanelHeading icon={Bot} label="Evacua assistant" value={isSessionActive ? "voice live" : "command ready"} />
          <Button
            type="button"
            size="icon"
            variant={isSessionActive ? "ember" : "glass"}
            onClick={onToggleVoice}
            aria-label={isSessionActive ? "Stop voice session" : "Start voice session"}
          >
            {isSessionActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/28 p-3">
          <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_18%_0%,rgba(85,181,217,0.18),transparent_36%),linear-gradient(110deg,transparent,rgba(255,255,255,0.055),transparent)]" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                <BrainCircuit className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
                Unified command
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-white">
                {selectedIncident?.name ?? plan?.incidentName ?? "Highest impact fire"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
                Speak or type what you need. Evacua prepares briefs, plans, and approval-gated actions on demand.
              </p>
            </div>
            {plan ? (
              <span className={cn("shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] uppercase", riskStyles[plan.riskLevel])}>
                {plan.riskLevel}
              </span>
            ) : (
              <span className="shrink-0 rounded-md border border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/15 px-2 py-1 font-mono text-[10px] uppercase text-[var(--color-cyan)]">
                Ready
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.07] bg-black/25 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <AudioLines className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
              Signal
            </span>
            <span>{isSpeaking ? "speaking" : isSessionActive ? "listening" : "idle"}</span>
          </div>
          <Progress
            value={Math.min(volumeLevel * 100, 100)}
            className="h-2"
            indicatorClassName={isSessionActive ? "bg-[var(--color-cyan)]" : "bg-white/20"}
          />
        </div>

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitPrompt();
          }}
        >
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            rows={2}
            className="min-h-[64px] w-full resize-none rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs leading-relaxed text-[var(--color-text-secondary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-cyan)]/35"
            placeholder="Ask Evacua about the current incident..."
          />
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
              {planLoading || briefLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-[var(--color-cyan)]" />
              ) : (
                <Sparkles className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
              )}
              {planLoading ? "planning" : briefLoading ? "synthesizing" : "context aware"}
            </span>
            <Button type="submit" variant="primary" size="sm" disabled={busy || !prompt.trim()} aria-label="Send typed command">
              <Send className="h-4 w-4" strokeWidth={1.75} />
              Send
            </Button>
          </div>
        </form>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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

          {brief && !planLoading && (
            <AssistantBriefSurface brief={brief} onFollowUp={onFollowUp} />
          )}

          <div className="evacua-scanline">
            {messages.length > 0 || isSessionActive ? (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {messages.map((msg, index) => (
                    <motion.div
                      key={`${msg.timestamp}-${index}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className={cn(
                        "rounded-lg border px-3 py-2",
                        msg.role === "assistant"
                          ? "border-[var(--color-cyan)]/18 bg-[var(--color-cyan-soft)]/10"
                          : "border-white/[0.07] bg-black/25",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase text-[var(--color-text-muted)]">
                          {msg.role === "assistant" ? (
                            <Volume2 className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
                          ) : (
                            <Mic className="h-3 w-3" strokeWidth={1.75} />
                          )}
                          {msg.role === "assistant" ? "Evacua" : "Operator"}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{msg.timestamp}</span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                        {msg.content ?? msg.transcript ?? ""}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isSpeaking && (
                  <div className="rounded-lg border border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/12 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-cyan)]">
                      <Volume2 className="h-4 w-4" strokeWidth={1.75} />
                      Voice response active
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="animate-progress h-full rounded-full bg-[var(--color-cyan)]" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[180px] items-center justify-center text-center">
                <div>
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                    <Bot className="h-5 w-5 text-[var(--color-cyan)]" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm font-medium text-white">Evacua standby</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">Voice and typed command channel ready.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
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
          Generating incident plan
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Evacua is reading incident, responder, route, zone, and alert context.
        </p>
      </div>
    );
  }

  if (!plan) return null;

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
  selectedIncident,
  weather,
  loading,
  activeFire,
}: {
  selectedIncident: FireIncident | null;
  weather: WeatherData | null;
  loading: boolean;
  activeFire: FireStateResponse["fires"][number] | null;
}) {
  const humidity = weather?.humidity ?? 0;
  const temp = weather?.temp ?? 0;
  const visibility = weather?.visibility ?? 6.4;
  const aqi = weather?.airQuality?.aqi ?? (selectedIncident ? 142 : 0);
  const growth = activeFire?.growth_rate ?? 0;

  return (
    <Card className="evacua-panel shrink-0">
      <CardHeader className="border-b border-white/[0.07]">
        <PanelHeading icon={Activity} label="Environmental load" value={loading ? "syncing" : weather?.description ?? "standby"} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <WeatherStat icon={Thermometer} label="Temp" value={`${temp}F`} color={getTempColor(temp)} />
          <WeatherStat icon={Wind} label="Wind" value={weather ? `${weather.wind.speed} ${weather.wind.direction}` : "0 mph"} color="#55b5d9" />
          <WeatherStat icon={ShieldCheck} label="Humidity" value={`${humidity}%`} color={getHumidityColor(humidity)} />
          <WeatherStat icon={Gauge} label="AQI" value={aqi ? getAqiLabel(aqi) : "Good"} color={getAqiColor(aqi)} />
        </div>

        <RiskBar label="Visibility" value={Math.min((visibility / 10) * 100, 100)} caption={getVisLabel(visibility)} color={getVisColor(visibility)} />
        <RiskBar label="Fire growth" value={Math.min(growth * 4, 100)} caption={growth ? `${Math.round(growth)} m/min` : "Stable"} color={growth > 18 ? "#e25656" : "#ff9e3d"} />
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
      <Progress value={value} className="h-1.5" indicatorClassName="bg-[var(--risk-color)]" style={{ "--risk-color": color } as React.CSSProperties} />
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
