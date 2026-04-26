"use client";

import { Truck, Timer, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import { useResponderOps } from "@/lib/hooks/use-responder-ops";

export function ResponderLifecyclePanel({
  focusedEvent,
}: {
  focusedEvent: CrisisEvent | null;
}) {
  const responder = useResponderOps(focusedEvent);

  const activeForIncident = useMemo(
    () =>
      focusedEvent
        ? responder.activeResponders.filter((r) => r.incidentId === focusedEvent.id)
        : [],
    [focusedEvent, responder.activeResponders],
  );

  return (
    <section className="rounded-lg border border-white/[0.07] bg-black/25 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
          <Truck className="h-3 w-3" strokeWidth={1.75} />
          Responder lifecycle
        </div>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {responder.loadingStats
            ? "syncing..."
            : `${responder.totals?.available ?? 0}/${responder.totals?.total ?? 0} available`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Available" value={responder.totals?.available ?? 0} tone="cyan" />
        <Stat label="En route" value={responder.totals?.dispatched ?? 0} tone="amber" />
        <Stat label="On scene" value={responder.totals?.active ?? 0} tone="red" />
      </div>

      <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/25 p-2">
        <p className="mb-1 text-[10px] uppercase text-[var(--color-text-muted)]">
          {focusedEvent ? "Focused incident teams" : "Station status"}
        </p>
        {focusedEvent ? (
          activeForIncident.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No teams assigned to this incident yet.
            </p>
          ) : (
            <div className="space-y-1">
              {activeForIncident.map((t) => (
                <p key={t.id} className="text-[11.5px] text-[var(--color-text-secondary)]">
                  Team {t.teamNumber} - {t.status.replace("_", " ")}
                  {t.etaIso ? (
                    <span className="ml-1 text-[var(--color-text-muted)]">
                      <Timer className="mr-1 inline h-3 w-3" strokeWidth={1.75} />
                      ETA {new Date(t.etaIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  ) : null}
                </p>
              ))}
            </div>
          )
        ) : responder.stationStats.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-muted)]">No station data yet.</p>
        ) : (
          <div className="space-y-1">
            {responder.stationStats.slice(0, 3).map((s) => (
              <p key={s.firestation_id} className="text-[11.5px] text-[var(--color-text-secondary)]">
                {s.firestation_name}: {s.available_teams} avail - {s.dispatched_teams} route - {s.active_teams} scene
              </p>
            ))}
          </div>
        )}
      </div>

      {responder.lastDispatch && (
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-cyan)]">
          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
          {responder.lastDispatch}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "red";
}) {
  const toneClass =
    tone === "red" ? "text-[var(--color-red)]" : tone === "amber" ? "text-[var(--color-ember)]" : "text-[var(--color-cyan)]";
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-2 py-2">
      <p className="text-[10px] uppercase text-[var(--color-text-muted)]">{label}</p>
      <p className={`mt-0.5 font-mono text-[16px] ${toneClass}`}>{value}</p>
    </div>
  );
}
