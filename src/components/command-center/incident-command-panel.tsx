"use client";

import {
  AlertTriangle,
  Bot,
  Flame,
  Radio,
  Route,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import { SourceChip, type SourceKey } from "./source-chip";
import { SignalVideoPreview } from "./signal-video-preview";
import { HomeConditionsPanel } from "./home-conditions-panel";
import { AlertDispatchPanel } from "./alert-dispatch-panel";
import { ResponderLifecyclePanel } from "./responder-lifecycle-panel";
import { OpsVoicePanel } from "./ops-voice-panel";
import {
  IncidentOpsPanel,
  type IncidentOpsState,
} from "./incident-ops-panel";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { HomeConditions } from "@/lib/hooks/use-home-conditions";
import type {
  AgentOpsResponse,
  FireStateResponse,
  ResponderStatsResponse,
  RouteOpsResponse,
} from "@/lib/hooks/use-fire-ops";
import { cn } from "@/lib/utils";

export function IncidentCommandPanel({
  events,
  focusedEvent,
  onClearFocusedEvent,
  focusedOpsState,
  onTogglePinFocused,
  onEscalateFocused,
  onStabilizeFocused,
  homeConditions,
  homeConditionsLoading,
  fireState,
  responderOps,
  routeOps,
  agentOps,
  sourcesUsed,
}: {
  events: CrisisEvent[];
  focusedEvent: CrisisEvent | null;
  onClearFocusedEvent?: () => void;
  focusedOpsState?: IncidentOpsState | null;
  onTogglePinFocused?: () => void;
  onEscalateFocused?: () => void;
  onStabilizeFocused?: () => void;
  homeConditions?: HomeConditions | null;
  homeConditionsLoading?: boolean;
  fireState?: FireStateResponse | null;
  responderOps?: ResponderStatsResponse | null;
  routeOps?: RouteOpsResponse | null;
  agentOps?: AgentOpsResponse | null;
  sourcesUsed?: string[];
}) {
  const activeFire = focusedEvent
    ? fireState?.fires.find((fire) => fire.id === focusedEvent.id)
    : fireState?.fires[0];
  const selectedEvent =
    focusedEvent ??
    (activeFire ? events.find((event) => event.id === activeFire.id) ?? null : null);
  const responderTotals = responderOps?.totals;
  const teamsForFire = activeFire
    ? responderOps?.activeResponders.filter((team) => team.incidentId === activeFire.id) ?? []
    : [];
  const routesForFire = activeFire
    ? routeOps?.routes.filter((route) => route.fire_id === activeFire.id) ?? []
    : [];
  const zonesForFire = activeFire
    ? routeOps?.evacuations.filter((zone) => zone.fire_id === activeFire.id) ?? []
    : [];

  return (
    <aside className="evacua-panel flex h-full flex-col overflow-hidden rounded-lg backdrop-blur-sm">
      <div className="border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
            <Radio className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
            Incident intelligence
          </div>
          {selectedEvent && (
            <button
              type="button"
              onClick={onClearFocusedEvent}
              className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text-primary)]"
              aria-label="Clear focused incident"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {!activeFire && !selectedEvent ? (
          <EmptyOpsState />
        ) : (
          <div className="space-y-3">
            <IncidentHero event={selectedEvent} fire={activeFire} />

            <div className="grid grid-cols-3 gap-2">
              <Metric
                icon={Flame}
                label="Fires"
                value={fireState?.count.active_fires ?? 0}
                tone="ember"
              />
              <Metric
                icon={Truck}
                label="Teams"
                value={responderTotals?.available ?? 0}
                sub={`${responderTotals?.total ?? 0} total`}
                tone="cyan"
              />
              <Metric
                icon={Route}
                label="Routes"
                value={routesForFire.length}
                sub={`${zonesForFire.length} zones`}
                tone="muted"
              />
            </div>

            {selectedEvent && <SignalVideoPreview event={selectedEvent} />}

            <HomeConditionsPanel
              conditions={homeConditions ?? null}
              loading={homeConditionsLoading ?? false}
            />

            <OpsSection icon={Bot} label="Agent advisories">
              <div className="space-y-1.5">
                {(agentOps?.findings ?? []).slice(0, 3).map((finding) => (
                  <div
                    key={finding.id}
                    className="rounded-lg border border-[var(--color-line-subtle)]/70 bg-[var(--color-bg-oled)]/35 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] text-[var(--color-text-primary)]">
                        {finding.fireName}
                      </p>
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] uppercase",
                          finding.severity === "critical"
                            ? "border-[var(--color-red)]/40 text-[var(--color-red)]"
                            : "border-[var(--color-ember)]/40 text-[var(--color-ember)]",
                        )}
                      >
                        {finding.severity}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-[var(--color-text-secondary)]">
                      {finding.reason}
                    </p>
                  </div>
                ))}
                {(agentOps?.findings.length ?? 0) === 0 && (
                  <p className="text-[11.5px] text-[var(--color-text-muted)]">
                    No route or evacuation changes in the latest scan.
                  </p>
                )}
              </div>
            </OpsSection>

            <ResponderLifecyclePanel focusedEvent={selectedEvent} />

            {selectedEvent && (
              <AlertDispatchPanel
                event={selectedEvent}
                posture={
                  selectedEvent.severity === "extreme" || (selectedEvent.impact ?? 0) >= 0.75
                    ? "leave"
                    : "prepare"
                }
                region="California operations region"
              />
            )}

            {selectedEvent && focusedOpsState && (
              <IncidentOpsPanel
                event={selectedEvent}
                state={focusedOpsState}
                onPinToggle={() => onTogglePinFocused?.()}
                onEscalate={() => onEscalateFocused?.()}
                onStabilize={() => onStabilizeFocused?.()}
              />
            )}

            <OpsVoicePanel focusedEvent={selectedEvent} />

            <OpsSection icon={ShieldCheck} label="Official sources">
              <div className="grid grid-cols-2 gap-2">
                {["calfire", "caltrans", "nws", "nifc"].map((source) => (
                  <SourceChip key={source} source={source as SourceKey} />
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                Feed mix: {(sourcesUsed ?? []).join(", ") || "public feeds"}.
              </p>
            </OpsSection>

            {teamsForFire.length > 0 && (
              <OpsSection icon={Truck} label="Assigned teams">
                <div className="space-y-1">
                  {teamsForFire.map((team) => (
                    <p
                      key={team.id}
                      className="text-[11.5px] text-[var(--color-text-secondary)]"
                    >
                      Team {team.teamNumber} - {team.status.replace("_", " ")}
                      {team.etaIso ? (
                        <span className="ml-1 text-[var(--color-text-muted)]">
                          ETA{" "}
                          {new Date(team.etaIso).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : null}
                    </p>
                  ))}
                </div>
              </OpsSection>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function IncidentHero({
  event,
  fire,
}: {
  event: CrisisEvent | null;
  fire?: FireStateResponse["fires"][number];
}) {
  const title = event?.headline ?? fire?.name ?? "Incident selected";
  const risk = fire?.risk_level ?? event?.severity ?? "watch";
  const containment = fire?.containment ?? null;
  const impact = event?.impact != null ? Math.round(event.impact * 100) : null;

  return (
    <section className="rounded-lg border border-[var(--color-ember)]/30 bg-[var(--color-ember-soft)]/12 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-ember)]/35 px-2 py-0.5 font-mono text-[10px] uppercase text-[var(--color-ember)]">
          <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
          {risk}
        </span>
        {impact != null && (
          <span className="font-mono text-[10.5px] uppercase text-[var(--color-text-muted)]">
            impact {impact}%
          </span>
        )}
      </div>
      <h2 className="text-[18px] font-medium leading-snug text-[var(--color-text-primary)]">
        {title}
      </h2>
      <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
        {event?.rationale || event?.body || fire?.description || "Monitoring active wildfire operations feed."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--color-text-muted)]">
        {containment != null && (
          <span className="rounded-md border border-[var(--color-line-subtle)] px-2 py-0.5">
            containment {Math.round(containment)}%
          </span>
        )}
        {fire?.growth_rate != null && (
          <span className="rounded-md border border-[var(--color-line-subtle)] px-2 py-0.5">
            growth {Math.round(fire.growth_rate)} m/min
          </span>
        )}
        {fire?.estimated_radius != null && (
          <span className="rounded-md border border-[var(--color-line-subtle)] px-2 py-0.5">
            radius {(fire.estimated_radius / 1000).toFixed(1)} km
          </span>
        )}
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
  tone: "ember" | "cyan" | "muted";
}) {
  const toneClass =
    tone === "ember"
      ? "text-[var(--color-ember)]"
      : tone === "cyan"
        ? "text-[var(--color-cyan)]"
        : "text-[var(--color-text-primary)]";
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9.5px] uppercase text-[var(--color-text-muted)]">
        <Icon className="h-3 w-3" strokeWidth={1.75} />
        {label}
      </div>
      <p className={`mt-1 font-mono text-[16px] ${toneClass}`}>{value}</p>
      {sub && <p className="text-[10.5px] text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  );
}

function OpsSection({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-black/25 p-3">
      <div className="mb-2 flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
        <Icon className="h-3 w-3" strokeWidth={1.75} />
        {label}
      </div>
      {children}
    </section>
  );
}

function EmptyOpsState() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-line-subtle)] bg-[var(--color-bg-oled)]">
        <Flame className="h-4 w-4 text-[var(--color-ember)]" strokeWidth={1.75} />
      </div>
      <p className="max-w-[30ch] text-[13px] leading-relaxed text-[var(--color-text-muted)]">
        Select an incident on the map or in the incident board to load fire
        video, weather, routes, responders, and alert actions.
      </p>
    </div>
  );
}
