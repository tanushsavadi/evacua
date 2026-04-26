"use client";

import { useMemo, useState } from "react";
import type { ElementType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Loader2,
  MapPinned,
  Radio,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FireIncident } from "@/lib/composio-telegram-service";
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

type Props = {
  selectedIncident: FireIncident | null;
  home: LatLng;
  dispatchDisabled?: boolean;
  alertDisabled?: boolean;
  onDispatch: () => void;
  onPrepareAlert: () => void;
  onFocusIncident?: (incidentId: string) => void;
};

const actionIcons: Record<OpusCommanderActionType, ElementType> = {
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

export function EvacuaCommanderPanel({
  selectedIncident,
  home,
  dispatchDisabled,
  alertDisabled,
  onDispatch,
  onPrepareAlert,
  onFocusIncident,
}: Props) {
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<OpusCommanderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  const focusedOnPlanIncident = !result?.incidentId || selectedIncident?.id === result.incidentId;
  const incidentLabel = result?.incidentName ?? selectedIncident?.name ?? "Highest impact fire";
  const primaryAction = useMemo(
    () => result?.recommendedActions.find((action) => action.type === "dispatch" || action.type === "alert"),
    [result],
  );

  async function runCommander(judgeDemo = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/evacua-commander", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: judgeDemo ? undefined : selectedIncident?.id,
          home,
          mode: "recommend",
          operatorIntent: judgeDemo
            ? "Run the clearest hackathon judge demo scenario. Pick the highest-impact active fire and produce an auditable responder action plan."
            : intent.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Commander run failed");
      setResult(json as OpusCommanderResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commander run failed");
    } finally {
      setLoading(false);
    }
  }

  function handleApproval(action: OpusCommanderAction) {
    if (!focusedOnPlanIncident && result?.incidentId) {
      onFocusIncident?.(result.incidentId);
      return;
    }
    if (action.type === "dispatch") onDispatch();
    if (action.type === "alert") onPrepareAlert();
  }

  return (
    <Card className="evacua-panel shrink-0 overflow-hidden">
      <CardHeader className="border-b border-white/[0.07]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-[11px] uppercase text-[var(--color-text-muted)]">
              <BrainCircuit className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
              Evacua commander
            </CardTitle>
            <p className="mt-1 truncate text-sm font-semibold text-white">{incidentLabel}</p>
          </div>
          <Badge
            variant="secondary"
            className="border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/15 font-mono text-[10px] uppercase text-[var(--color-cyan)]"
          >
            Approval gated
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-black/28 p-3">
          <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_22%_0%,rgba(85,181,217,0.18),transparent_34%),linear-gradient(110deg,transparent,rgba(255,255,255,0.06),transparent)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
                Safety gate active
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                Requires operator approval before dispatch or public alert.
              </p>
            </div>
            {result && (
              <span className={cn("rounded-md border px-2 py-1 font-mono text-[10px] uppercase", riskStyles[result.riskLevel])}>
                {result.riskLevel}
              </span>
            )}
          </div>
        </div>

        <textarea
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          rows={2}
          className="min-h-[58px] w-full resize-none rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-xs leading-relaxed text-[var(--color-text-secondary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-cyan)]/35"
          placeholder="Operator intent"
        />

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="cyan"
            size="sm"
            className="px-3"
            disabled={loading}
            onClick={() => void runCommander(false)}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" strokeWidth={1.75} />}
            Run plan
          </Button>
          <Button
            type="button"
            variant="glass"
            size="sm"
            className="px-3"
            disabled={loading}
            onClick={() => void runCommander(true)}
          >
            <Radio className="h-4 w-4" strokeWidth={1.75} />
            Judge demo
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setShowWhy((value) => !value)}
          className="flex w-full items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:border-white/[0.12] hover:text-white"
        >
          <span className="inline-flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
            Intelligence stack
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showWhy && "rotate-180")} strokeWidth={1.75} />
        </button>

        <AnimatePresence initial={false}>
          {showWhy && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24 }}
              className="overflow-hidden"
            >
              <div className="grid gap-2 rounded-lg border border-[var(--color-cyan)]/18 bg-[var(--color-cyan-soft)]/10 p-3 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                <WhyItem title="Signal fusion" body="Reads incident, responder, route, zone, and alert state in one commander pass." />
                <WhyItem title="Adaptive plan" body="Escalates only when the fire posture and operational constraints justify it." />
                <WhyItem title="Tool routing" body="Produces dispatch, alert, route, evacuation, and monitoring actions as typed approvals." />
                <WhyItem title="Vision roadmap" body="Future screenshot mode can inspect blocked corridors and visible risk zones." />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="rounded-lg border border-[var(--color-red)]/25 bg-[var(--color-red-soft)]/18 px-3 py-2 text-xs text-[var(--color-red)]">
            {error}
          </div>
        )}

        {result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <CompareCell label="Heuristic agent" value={result.heuristicSummary ?? "Rule baseline unavailable."} />
              <CompareCell label="Evacua commander" value={result.summary} highlight />
            </div>

            {primaryAction && (
              <div className="rounded-lg border border-white/[0.08] bg-black/25 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                  <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-amber)]" strokeWidth={1.75} />
                  Next best action
                </div>
                <p className="text-sm font-semibold text-white">{primaryAction.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">{primaryAction.rationale}</p>
              </div>
            )}

            <div className="space-y-2">
              {result.recommendedActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  incidentMismatch={!focusedOnPlanIncident}
                  dispatchDisabled={dispatchDisabled}
                  alertDisabled={alertDisabled}
                  onApprove={handleApproval}
                />
              ))}
            </div>

            {result.agentHandoffs && result.agentHandoffs.length > 0 && (
              <div className="rounded-lg border border-white/[0.08] bg-black/22 p-3">
                <div className="mb-3 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                  <ClipboardList className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
                  Role handoff
                </div>
                <div className="grid gap-2">
                  {result.agentHandoffs.map((handoff) => (
                    <HandoffCard key={`${handoff.role}-${handoff.objective}`} handoff={handoff} />
                  ))}
                </div>
              </div>
            )}

            {result.alertDraft && (
              <div className="rounded-lg border border-white/[0.08] bg-black/30 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                  <Send className="h-3.5 w-3.5 text-[var(--color-ember)]" strokeWidth={1.75} />
                  Alert draft
                </div>
                <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--color-text-secondary)]">
                  {result.alertDraft}
                </pre>
              </div>
            )}

            {result.incidentBriefMarkdown && (
              <div className="rounded-lg border border-white/[0.08] bg-black/30 p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                  <ClipboardList className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
                  Incident brief
                </div>
                <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-[var(--color-text-muted)]">
                  {result.incidentBriefMarkdown}
                </pre>
              </div>
            )}

            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
                Agent trace
              </div>
              <div className="space-y-3">
                {result.toolTrace.map((trace, index) => (
                  <div key={`${trace.step}-${index}`} className="grid grid-cols-[14px_1fr] gap-2">
                    <div className="relative flex justify-center">
                      <span className={cn("mt-0.5 h-2.5 w-2.5 rounded-full border", traceStatusClass(trace.status))} />
                      {index < result.toolTrace.length - 1 && <span className="absolute top-4 h-[calc(100%+2px)] w-px bg-white/[0.08]" />}
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-white">{trace.step}</p>
                        <span className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">{trace.status}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">{trace.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/[0.09] bg-black/18 p-5 text-center">
            <BrainCircuit className="mx-auto mb-3 h-8 w-8 text-[var(--color-cyan)]/70" strokeWidth={1.5} />
            <p className="text-sm font-medium text-white">Commander standby</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Select a fire or run the demo scenario.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WhyItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <span className="font-mono text-[10px] uppercase text-[var(--color-cyan)]">{title}</span>
      <span>{body}</span>
    </div>
  );
}

function CompareCell({
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
        "min-h-[112px] rounded-lg border p-3",
        highlight
          ? "border-[var(--color-cyan)]/25 bg-[var(--color-cyan-soft)]/12"
          : "border-white/[0.07] bg-black/22",
      )}
    >
      <div className="mb-2 font-mono text-[10px] uppercase text-[var(--color-text-muted)]">{label}</div>
      <p className="line-clamp-5 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">{value}</p>
    </div>
  );
}

function HandoffCard({ handoff }: { handoff: OpusCommanderHandoff }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/24 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase text-[var(--color-cyan)]">{handoff.role}</span>
        <span className="truncate text-[11px] text-[var(--color-text-muted)]">{handoff.objective}</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
        {handoff.recommendation}
      </p>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
        {handoff.evidence}
      </p>
    </div>
  );
}

function ActionCard({
  action,
  incidentMismatch,
  dispatchDisabled,
  alertDisabled,
  onApprove,
}: {
  action: OpusCommanderAction;
  incidentMismatch: boolean;
  dispatchDisabled?: boolean;
  alertDisabled?: boolean;
  onApprove: (action: OpusCommanderAction) => void;
}) {
  const Icon = actionIcons[action.type];
  const canApprove =
    action.type === "dispatch"
      ? !dispatchDisabled
      : action.type === "alert"
        ? !alertDisabled
        : action.requiresApproval;
  const actionable = action.type === "dispatch" || action.type === "alert";

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
          {action.requiresApproval && (
            <Button
              type="button"
              size="sm"
              variant={action.type === "alert" ? "ember" : action.type === "dispatch" ? "cyan" : "glass"}
              className="mt-3 h-8 px-3 text-[12px]"
              disabled={!canApprove && !incidentMismatch}
              onClick={() => onApprove(action)}
            >
              {incidentMismatch && actionable ? "Focus incident" : actionable ? "Approve" : "Review"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
