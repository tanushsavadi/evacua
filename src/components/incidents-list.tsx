"use client";

import { useEffect, useState } from "react";
import { Activity, Flame, MapPin, ShieldCheck } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface IncidentsListProps {
  incidents?: IncidentRecord[];
  loading?: boolean;
  onIncidentClick?: (incident: IncidentRecord) => void;
  onIncidentCountChange?: (count: number) => void;
  onIncidentsUpdate?: (incidents: IncidentRecord[]) => void;
  selectedId?: string;
}

type IncidentRecord = {
  id: string;
  name?: string | null;
  risk?: string | null;
  risk_level?: string | null;
  lat?: number | null;
  lon?: number | null;
  containment?: number | null;
  last_update?: string;
  description?: string | null;
};

const riskStyles: Record<string, string> = {
  critical: "border-[var(--color-red)]/45 bg-[var(--color-red-soft)]/45 text-[var(--color-red)]",
  high: "border-[var(--color-ember)]/45 bg-[var(--color-ember-soft)]/45 text-[var(--color-ember)]",
  medium: "border-[var(--color-amber)]/40 bg-[var(--color-amber-soft)]/35 text-[var(--color-amber)]",
  low: "border-[var(--color-cyan)]/35 bg-[var(--color-cyan-soft)]/35 text-[var(--color-cyan)]",
};

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-2 py-1 font-mono text-[10px] uppercase",
        riskStyles[risk] ?? riskStyles.low,
      )}
    >
      {risk || "watch"}
    </span>
  );
}

export default function IncidentsList({
  incidents: controlledIncidents,
  loading: controlledLoading,
  onIncidentClick,
  onIncidentCountChange,
  onIncidentsUpdate,
  selectedId,
}: IncidentsListProps) {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visibleIncidents = controlledIncidents ?? incidents;
  const isControlled = controlledIncidents !== undefined;

  useEffect(() => {
    if (controlledIncidents !== undefined) {
      onIncidentCountChange?.(controlledIncidents.length);
      onIncidentsUpdate?.(controlledIncidents);
      return;
    }

    async function fetchIncidents() {
      try {
        const res = await fetch("/api/fire-state");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data?.fires) {
          setIncidents(data.fires);
          onIncidentCountChange?.(data.fires.length);
          onIncidentsUpdate?.(data.fires);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch incidents");
      } finally {
        setLoading(false);
      }
    }

    fetchIncidents();
    const interval = setInterval(fetchIncidents, 10000);
    return () => clearInterval(interval);
  }, [controlledIncidents, isControlled, onIncidentCountChange, onIncidentsUpdate]);

  const isLoading = isControlled ? Boolean(controlledLoading) : loading;

  if (isLoading && visibleIncidents.length === 0) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-xs text-[var(--color-text-muted)]">
        <div className="relative h-9 w-9">
          <div className="absolute inset-0 rounded-full border border-[var(--color-cyan)]/25" />
          <div className="absolute inset-1 animate-spin rounded-full border-2 border-[var(--color-cyan)] border-t-transparent" />
        </div>
        Syncing incident feed
      </div>
    );
  }

  if (!isControlled && error) {
    return (
      <div className="m-3 rounded-lg border border-[var(--color-red)]/25 bg-[var(--color-red-soft)]/25 p-4 text-xs text-[var(--color-red)]">
        Feed unavailable: {error}
      </div>
    );
  }

  if (!visibleIncidents || visibleIncidents.length === 0) {
    return (
      <div className="m-3 flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-line-subtle)] bg-black/20 p-8 text-center">
        <ShieldCheck className="mb-3 h-8 w-8 text-[var(--color-cyan)]/45" strokeWidth={1.75} />
        <p className="text-sm font-medium text-[var(--color-text-primary)]">No active incidents</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Live monitoring remains connected.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {visibleIncidents.map((incident) => {
        const isSelected = selectedId === incident.id;
        const containment = Math.round(Number(incident.containment ?? 0));
        const risk = String(incident.risk_level ?? incident.risk ?? "low");

        return (
          <button
            key={incident.id}
            type="button"
            aria-label={`${incident.name ?? "Unnamed incident"}, ${risk} risk, ${containment}% contained${isSelected ? ", selected" : ""}`}
            aria-pressed={isSelected}
            onClick={() => onIncidentClick?.(incident)}
            className={cn(
              "group relative w-full overflow-hidden rounded-lg border p-3 text-left transition-[transform,border-color,background-color,box-shadow]",
              "duration-300 ease-[var(--ease-premium)] hover:-translate-y-0.5",
              isSelected
                ? "border-[var(--color-cyan)]/45 bg-[var(--color-cyan-soft)]/15 shadow-[0_20px_50px_-34px_rgba(85,181,217,0.9)]"
                : "border-[var(--color-line-subtle)] bg-black/20 hover:border-white/[0.14] hover:bg-white/[0.035]",
            )}
          >
            <div
              aria-hidden
              className={cn(
                "absolute inset-y-3 left-0 w-px rounded-full transition-opacity",
                isSelected ? "bg-[var(--color-cyan)] opacity-100" : "bg-[var(--color-ember)] opacity-0 group-hover:opacity-70",
              )}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase text-[var(--color-text-muted)]">
                  <Activity className="h-3 w-3" strokeWidth={1.75} />
                  {String(incident.id).slice(0, 8)}
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
                  {incident.name ?? "Unnamed incident"}
                </p>
              </div>
              <RiskBadge risk={risk} />
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                  <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                  <span className="truncate font-mono">
                    {Number(incident.lat ?? 0).toFixed(2)}, {Number(incident.lon ?? 0).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
                <Flame className="h-3 w-3 text-[var(--color-ember)]" strokeWidth={1.75} />
                <span className="font-mono tabular-nums">{containment}%</span>
              </div>
            </div>

            <Progress
              value={containment}
              label={`${incident.name ?? "Incident"} containment ${containment}%`}
              className="mt-3 h-1 bg-white/[0.05]"
              indicatorClassName="bg-gradient-to-r from-[var(--color-cyan)] to-[var(--color-ember)]"
            />
          </button>
        );
      })}
    </div>
  );
}
