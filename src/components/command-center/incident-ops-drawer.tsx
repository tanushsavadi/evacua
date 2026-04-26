"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListFilter,
  Search,
  X,
  ArrowDownUp,
  AlertTriangle,
  Flame,
  Wind,
  Route,
  Zap,
} from "lucide-react";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import { useResponderOps } from "@/lib/hooks/use-responder-ops";
import { cn } from "@/lib/utils";

type SortKey = "impact" | "recent" | "distance";
type KindFilter = "all" | "fire" | "wind" | "evac" | "road" | "power";

function kindGroup(ev: CrisisEvent): KindFilter {
  if (ev.kind.includes("fire")) return "fire";
  if (ev.kind.includes("red_flag") || ev.kind.includes("weather")) return "wind";
  if (ev.kind.includes("evacuation")) return "evac";
  if (ev.kind.includes("road")) return "road";
  if (ev.kind.includes("power")) return "power";
  return "all";
}

export function IncidentOpsDrawer({
  open,
  onClose,
  events,
  selectedEventId,
  onSelectEvent,
  onPinEvent,
  onEscalateEvent,
  onStabilizeEvent,
}: {
  open: boolean;
  onClose: () => void;
  events: CrisisEvent[];
  selectedEventId?: string | null;
  onSelectEvent: (eventId: string) => void;
  onPinEvent: (eventId: string) => void;
  onEscalateEvent: (eventId: string) => void;
  onStabilizeEvent: (eventId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("impact");
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = events.filter((ev) => {
      if (kind !== "all" && kindGroup(ev) !== kind) return false;
      if (!q) return true;
      return (
        ev.headline.toLowerCase().includes(q) ||
        ev.kind.toLowerCase().includes(q) ||
        ev.source.toLowerCase().includes(q)
      );
    });
    const withSort = base.slice().sort((a, b) => {
      if (sortBy === "impact") return (b.impact ?? 0) - (a.impact ?? 0);
      if (sortBy === "distance") return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });
    return withSort;
  }, [events, kind, query, sortBy]);
  const selectedEvent =
    filtered.find((ev) => ev.id === selectedEventId) ?? filtered[activeIdx] ?? null;
  const responder = useResponderOps(selectedEvent);
  const selectedTeams = selectedEvent
    ? responder.activeResponders.filter((r) => r.incidentId === selectedEvent.id)
    : [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (filtered.length === 0) return;
      const fallback = filtered[Math.max(0, Math.min(filtered.length - 1, activeIdx))];
      const selected = filtered.find((ev) => ev.id === selectedEventId) ?? fallback;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((v) => Math.min(filtered.length - 1, v + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((v) => Math.max(0, v - 1));
      } else if (e.key === "Enter") {
        const ev = filtered[activeIdx];
        if (!ev) return;
        onSelectEvent(ev.id);
        onClose();
      } else if (e.key.toLowerCase() === "p") {
        if (!selected) return;
        e.preventDefault();
        onSelectEvent(selected.id);
        onPinEvent(selected.id);
      } else if (e.key.toLowerCase() === "e") {
        if (!selected) return;
        e.preventDefault();
        onSelectEvent(selected.id);
        onEscalateEvent(selected.id);
      } else if (e.key.toLowerCase() === "s") {
        if (!selected) return;
        e.preventDefault();
        onSelectEvent(selected.id);
        onStabilizeEvent(selected.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    open,
    filtered,
    activeIdx,
    selectedEventId,
    onSelectEvent,
    onPinEvent,
    onEscalateEvent,
    onStabilizeEvent,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-[var(--color-bg-oled)]/65 backdrop-blur-sm">
      <button
        aria-label="Close incidents drawer"
        onClick={onClose}
        className="absolute inset-0"
      />
      <aside className="relative h-full w-full max-w-[420px] border-l border-white/[0.07] bg-black/90 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase text-[var(--color-text-muted)]">
            <ListFilter className="h-3.5 w-3.5" strokeWidth={1.75} />
            Incident ops
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-black/25 px-2.5 py-2">
          <Search className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search headline / kind / source"
            className="w-full bg-transparent text-[12px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        <div className="mb-2 flex flex-wrap gap-1.5">
          {(["all", "fire", "wind", "evac", "road", "power"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-lg border px-2 py-1 text-[10.5px] uppercase",
                kind === k
                  ? "border-[var(--color-cyan)]/40 text-[var(--color-cyan)]"
                  : "border-[var(--color-line-subtle)] text-[var(--color-text-secondary)]",
              )}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="mb-3 flex items-center gap-2">
          <ArrowDownUp className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-lg border border-white/[0.07] bg-black/45 px-2 py-1 text-[11.5px] text-[var(--color-text-primary)] outline-none"
          >
            <option value="impact">Sort by impact</option>
            <option value="recent">Sort by recency</option>
            <option value="distance">Sort by distance</option>
          </select>
          <span className="ml-auto text-[11px] text-[var(--color-text-muted)]">
            {filtered.length} results
          </span>
        </div>
        <ul className="space-y-1 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 360px)" }}>
          {filtered.map((ev, idx) => {
            const impactPct = Math.round((ev.impact ?? 0) * 100);
            const Icon =
              ev.kind.includes("fire")
                ? Flame
                : ev.kind.includes("road")
                  ? Route
                  : ev.kind.includes("power")
                    ? Zap
                    : ev.kind.includes("evacuation")
                      ? AlertTriangle
                      : Wind;
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectEvent(ev.id);
                    onClose();
                  }}
                  className={cn(
                    "w-full rounded-lg border px-2.5 py-2 text-left transition-colors",
                    idx === activeIdx || selectedEventId === ev.id
                      ? "border-[var(--color-cyan)]/35 bg-[var(--color-cyan-soft)]/10"
                      : "border-white/[0.07] bg-black/25 hover:border-white/[0.14]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} />
                    <span className="truncate text-[12.5px] text-[var(--color-text-primary)]">
                      {ev.headline}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-[var(--color-text-muted)]">
                    <span className="font-mono uppercase">{ev.source}</span>
                    <span>impact {impactPct}%</span>
                    {ev.distanceKm != null && <span>{ev.distanceKm.toFixed(1)} km</span>}
                  </div>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="rounded-lg border border-dashed border-white/[0.08] p-3 text-[12px] text-[var(--color-text-muted)]">
              No incidents match these filters.
            </li>
          )}
        </ul>

        <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/25 p-2.5">
          <p className="mb-1 text-[10px] uppercase text-[var(--color-text-muted)]">
            Incident responder timeline
          </p>
          {!selectedEvent ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Select an incident to view team timeline.
            </p>
          ) : selectedTeams.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              No assigned teams yet. Use dispatch actions from focused incident panels.
            </p>
          ) : (
            <div className="space-y-1">
              {selectedTeams.map((t) => (
                <p key={t.id} className="text-[11.5px] text-[var(--color-text-secondary)]">
                  Team {t.teamNumber} - {t.status.replace("_", " ")}
                  {t.etaIso ? (
                    <span className="ml-1 text-[var(--color-text-muted)]">
                      ETA{" "}
                      {new Date(t.etaIso).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : null}
                </p>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
