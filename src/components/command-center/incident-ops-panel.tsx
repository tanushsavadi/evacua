"use client";

import { Flag, AlertOctagon, ShieldCheck, History } from "lucide-react";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import { useResponderOps } from "@/lib/hooks/use-responder-ops";
import { cn } from "@/lib/utils";

export type IncidentOpsLog = {
  id: string;
  action: "pin" | "escalate" | "stabilize";
  note: string;
  at: number;
};

export type IncidentOpsState = {
  pinned: boolean;
  status: "active" | "escalated" | "stabilized";
  log: IncidentOpsLog[];
};

export function IncidentOpsPanel({
  event,
  state,
  onPinToggle,
  onEscalate,
  onStabilize,
}: {
  event: CrisisEvent;
  state: IncidentOpsState;
  onPinToggle: () => void;
  onEscalate: () => void;
  onStabilize: () => void;
}) {
  const responder = useResponderOps(event);

  return (
    <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10.5px] uppercase text-[var(--color-text-muted)]">
          <History className="h-3.5 w-3.5" strokeWidth={1.75} />
          Incident ops
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase",
            state.status === "escalated"
              ? "border-[var(--color-red)]/40 text-[var(--color-red)]"
              : state.status === "stabilized"
                ? "border-[var(--color-cyan)]/40 text-[var(--color-cyan)]"
                : "border-[var(--color-line-subtle)] text-[var(--color-text-muted)]",
          )}
        >
          {state.status}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <ActionChip
          icon={Flag}
          label={state.pinned ? "Unpin" : "Pin"}
          onClick={onPinToggle}
          accent={state.pinned ? "cyan" : "muted"}
        />
        <ActionChip
          icon={AlertOctagon}
          label="Escalate"
          onClick={onEscalate}
          accent="red"
        />
        <ActionChip
          icon={ShieldCheck}
          label="Stabilize"
          onClick={onStabilize}
          accent="cyan"
        />
        <ActionChip
          icon={History}
          label={responder.dispatching ? "Sending..." : "Send Responder"}
          onClick={() => {
            void responder.dispatch();
          }}
          accent="muted"
          disabled={responder.dispatching}
        />
      </div>

      <div className="mb-2 rounded-lg border border-white/[0.07] bg-black/25 p-2">
        <p className="text-[10px] uppercase text-[var(--color-text-muted)]">
          Responder network
        </p>
        <p className="mt-1 text-[11.5px] text-[var(--color-text-secondary)]">
          {responder.loadingStats
            ? "Refreshing team status..."
            : responder.totals
              ? `${responder.totals.available} available - ${responder.totals.dispatched} en route - ${responder.totals.active} on scene`
              : "Responder status unavailable"}
        </p>
        {responder.lastDispatch && (
          <p className="mt-1 text-[11px] text-[var(--color-cyan)]">{responder.lastDispatch}</p>
        )}
        {responder.error && (
          <p className="mt-1 text-[11px] text-[var(--color-red)]">{responder.error}</p>
        )}
      </div>

      <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-white/[0.07] bg-black/25 p-2">
        {state.log.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-muted)]">
            No operations logged yet for this signal.
          </p>
        ) : (
          state.log
            .slice()
            .reverse()
            .map((row) => (
              <p key={row.id} className="text-[11.5px] leading-snug text-[var(--color-text-secondary)]">
                <span className="mr-1.5 font-mono text-[10px] uppercase text-[var(--color-text-muted)]">
                  {new Date(row.at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {row.note}
              </p>
            ))
        )}
      </div>

      <p className="mt-2 text-[10.5px] text-[var(--color-text-muted)]">
        Focus: {event.headline}
      </p>
    </div>
  );
}

function ActionChip({
  icon: Icon,
  label,
  onClick,
  accent,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  accent: "muted" | "red" | "cyan";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        accent === "red"
          ? "border-[var(--color-red)]/35 text-[var(--color-red)] hover:bg-[var(--color-red-soft)]/20"
          : accent === "cyan"
            ? "border-[var(--color-cyan)]/35 text-[var(--color-cyan)] hover:bg-[var(--color-cyan-soft)]/20"
            : "border-[var(--color-line-subtle)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={1.75} />
      {label}
    </button>
  );
}
