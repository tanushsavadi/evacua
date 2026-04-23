"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronLeft,
  Navigation,
  Phone,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";

import { Wordmark } from "@/components/landing/wordmark";
import { StateBadge } from "@/components/command-center/state-badge";
import { SCENARIOS } from "@/lib/scenarios";
import { useSignals } from "@/lib/hooks/use-signals";
import { usePlan } from "@/lib/hooks/use-plan";
import { useHouseholdStore } from "@/lib/store/household";
import type { Household } from "@/lib/schemas/household";
import type { Plan } from "@/lib/schemas/plan";
import { cancelSpeech, composeBrief, isVoiceAvailable, speak } from "@/lib/voice/speak";
import { cn, formatCountdown } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function GoPage() {
  return (
    <Suspense fallback={<Shell />}>
      <GoContents />
    </Suspense>
  );
}

function Shell() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-[var(--color-bg-oled)]">
      <div className="h-2 w-24 animate-pulse rounded-full bg-[var(--color-line-subtle)]" />
    </div>
  );
}

const subscribe = () => () => {};

function GoContents() {
  const searchParams = useSearchParams();
  const demoId = searchParams.get("demo");
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  const household = useHouseholdStore((s) => s.household);
  const scenario = demoId ? SCENARIOS[demoId] : undefined;
  const demoHousehold: Household | null = scenario
    ? buildDemoHousehold(scenario.id)
    : null;
  const active = demoHousehold ?? household ?? null;
  const home = mounted && active ? active.coords : null;

  const { data: signals } = useSignals({ home, demo: demoId ?? null });
  const { plan, latestDiff, acknowledgeDiff } = usePlan({
    household: mounted ? active : null,
    events: signals?.events ?? [],
    state: signals?.state ?? "watch",
  });

  const state = plan?.state ?? signals?.state ?? "watch";

  // Surface diffs as toasts on mobile too; the action card stays focused.
  const lastToastedDiffId = useRef<string | null>(null);
  useEffect(() => {
    if (!latestDiff) return;
    if (lastToastedDiffId.current === latestDiff.id) return;
    lastToastedDiffId.current = latestDiff.id;
    toast(latestDiff.headline, { description: latestDiff.narrative });
  }, [latestDiff]);

  if (!mounted || !active || !plan) {
    return <WaitingShell hasHousehold={Boolean(active)} />;
  }

  return (
    <ActionCard
      plan={plan}
      household={active}
      state={state}
      onDismissDiff={acknowledgeDiff}
    />
  );
}

function WaitingShell({ hasHousehold }: { hasHousehold: boolean }) {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--color-bg-oled)] px-8 text-center">
      <Wordmark className="opacity-80" />
      <p className="text-[13.5px] text-[var(--color-text-secondary)]">
        {hasHousehold
          ? "Composing your action card…"
          : "Set up your household or open a demo scenario to enter action mode."}
      </p>
      <Link
        href={hasHousehold ? "/plan" : "/setup"}
        className="text-[13px] text-[var(--color-cyan)] underline-offset-4 hover:underline"
      >
        {hasHousehold ? "Open command center" : "Start setup"}
      </Link>
    </div>
  );
}

function ActionCard({
  plan,
  household,
  state,
  onDismissDiff,
}: {
  plan: Plan;
  household: Household;
  state: Plan["state"];
  onDismissDiff: () => void;
}) {
  const primary = plan.routes.find((r) => r.id === plan.primaryRouteId);

  // Track completed task ids, scoped to plan id so re-plans reset progress.
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const planIdRef = useRef(plan.id);
  useEffect(() => {
    if (planIdRef.current !== plan.id) {
      planIdRef.current = plan.id;
      setCompleted(new Set());
      onDismissDiff();
    }
  }, [plan.id, onDismissDiff]);

  const ordered = useMemo(() => {
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...plan.tasks].sort(
      (a, b) => rank[a.priority] - rank[b.priority],
    );
  }, [plan.tasks]);

  const nextTask = ordered.find((t) => !completed.has(t.id));
  const doneCount = completed.size;
  const totalCount = ordered.length;

  const [speaking, setSpeaking] = useState(false);
  const voiceAvailable = isVoiceAvailable();

  const speakBrief = useCallback(() => {
    if (!voiceAvailable) {
      toast("Voice briefing unavailable", {
        description: "Your browser doesn't support speech synthesis.",
      });
      return;
    }
    if (speaking) {
      cancelSpeech();
      setSpeaking(false);
      return;
    }
    const leaveByMinutes =
      plan.leaveByIso != null
        ? Math.round((Date.parse(plan.leaveByIso) - Date.now()) / 60_000)
        : null;
    const text = composeBrief({
      posture: state,
      leaveByMinutes,
      destinationLabel: plan.destination.label,
      primaryVia: primary?.via ?? primary?.summary ?? "the recommended route",
      firstHighTask: ordered.find((t) => t.priority === "high")?.text,
    });
    setSpeaking(true);
    speak(text, { onend: () => setSpeaking(false) });
  }, [voiceAvailable, speaking, plan, state, primary, ordered]);

  useEffect(() => () => cancelSpeech(), []);

  const contact = household.contacts[0];
  const mapsUrl = primary
    ? `https://www.google.com/maps/dir/?api=1&origin=${household.coords.lat},${household.coords.lng}&destination=${plan.destination.coords.lat},${plan.destination.coords.lng}&travelmode=driving`
    : null;

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-bg-oled)]">
      <AmbientGlow state={state} />

      <header className="relative z-10 flex items-center justify-between px-5 pt-5">
        <Link
          href={`/plan${household.id.startsWith("demo_") ? `?demo=${household.id.replace("demo_", "")}` : ""}`}
          className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 px-3 text-[12px] text-[var(--color-text-secondary)] backdrop-blur-sm transition-colors hover:text-[var(--color-text-primary)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          Plan
        </Link>
        <Wordmark className="opacity-70" />
        <StateBadge state={state} size="sm" />
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-5 pt-6 pb-6">
        <Countdown plan={plan} state={state} />

        <DestinationStrip
          plan={plan}
          mapsUrl={mapsUrl}
          viaLabel={primary?.via ?? primary?.summary}
          etaMin={primary ? Math.round(primary.durationMin) : null}
        />

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
              Next step
            </span>
            <span className="font-mono text-[10.5px] tabular-nums uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
              {doneCount}/{totalCount} done
            </span>
          </div>
          <AnimatePresence mode="wait">
            {nextTask ? (
              <TaskHero
                key={nextTask.id}
                task={nextTask}
                onDone={() =>
                  setCompleted((prev) => new Set(prev).add(nextTask.id))
                }
              />
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="rounded-2xl border border-[var(--color-cyan)]/40 bg-[var(--color-cyan-soft)]/20 p-5"
              >
                <p className="font-display text-[17px] text-[var(--color-text-primary)]">
                  All steps completed.
                </p>
                <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
                  Stay on route. Evacua will surface new tasks if conditions change.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <Progress
            tasks={ordered}
            completed={completed}
            onToggle={(id) =>
              setCompleted((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          />
        </div>
      </main>

      <footer className="relative z-10 border-t border-[var(--color-line-subtle)]/80 bg-[var(--color-bg-oled)]/90 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="flex items-center gap-2">
          <BigAction
            primary
            href={mapsUrl ?? undefined}
            icon={Navigation}
            label="Start drive"
            sub={
              primary
                ? `${Math.round(primary.durationMin)} min · ${primary.distanceKm.toFixed(1)} km`
                : "Route"
            }
          />
          {contact && (
            <BigAction
              href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
              icon={Phone}
              label={`Call ${contact.name.split(" ")[0]}`}
              sub={contact.relation ?? "Contact"}
            />
          )}
          <BriefButton speaking={speaking} onClick={speakBrief} />
        </div>
      </footer>
    </div>
  );
}

function AmbientGlow({ state }: { state: Plan["state"] }) {
  const color =
    state === "leave"
      ? "var(--color-ember)"
      : state === "prepare"
        ? "var(--color-amber)"
        : "var(--color-cyan)";
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: state === "leave" ? 0.7 : 0.35 }}
      transition={{ duration: 0.9 }}
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        background: `radial-gradient(120% 60% at 50% -10%, color-mix(in oklab, ${color} 22%, transparent) 0%, transparent 70%)`,
      }}
    />
  );
}

function Countdown({ plan, state }: { plan: Plan; state: Plan["state"] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(id);
  }, []);

  if (!plan.leaveByIso) {
    return (
      <div className="rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/60 p-5 text-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          Standby
        </p>
        <p className="mt-1 font-display text-[20px] text-[var(--color-text-primary)]">
          No leave window
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
          Conditions are calm. Keep your plan primed.
        </p>
      </div>
    );
  }

  const target = Date.parse(plan.leaveByIso);
  const remaining = Math.max(0, target - now);
  const windowMs = 60 * 60 * 1000;
  const pct = Math.min(1, Math.max(0, remaining / windowMs));

  const color =
    state === "leave"
      ? "var(--color-red)"
      : state === "prepare"
        ? "var(--color-ember)"
        : "var(--color-cyan)";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-[var(--color-bg-panel)]/70 p-5 backdrop-blur-sm",
        state === "leave"
          ? "border-[var(--color-red)]/40 animate-ember-pulse"
          : state === "prepare"
            ? "border-[var(--color-ember)]/40"
            : "border-[var(--color-line-subtle)]",
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
            Leave by
          </p>
          <p
            className="mt-1 font-mono text-[48px] font-medium leading-none tabular-nums tracking-tight"
            style={{ color }}
          >
            {formatCountdown(new Date(plan.leaveByIso))}
          </p>
          <p className="mt-1.5 text-[12.5px] text-[var(--color-text-secondary)]">
            {new Date(plan.leaveByIso).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            · {plan.headline}
          </p>
        </div>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-[var(--color-line-subtle)]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color, width: `${pct * 100}%` }}
          transition={{ duration: 0.7, ease: EASE }}
        />
      </div>
    </div>
  );
}

function DestinationStrip({
  plan,
  mapsUrl,
  viaLabel,
  etaMin,
}: {
  plan: Plan;
  mapsUrl: string | null;
  viaLabel?: string;
  etaMin: number | null;
}) {
  const content = (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/60 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          Destination
        </p>
        <p className="mt-0.5 truncate font-display text-[15.5px] text-[var(--color-text-primary)]">
          {plan.destination.label}
        </p>
        {viaLabel && (
          <p className="truncate text-[12px] text-[var(--color-text-muted)]">
            via {viaLabel}
          </p>
        )}
      </div>
      {etaMin != null && (
        <div className="ml-3 text-right">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
            ETA
          </p>
          <p className="font-mono text-[18px] tabular-nums text-[var(--color-text-primary)]">
            {etaMin} min
          </p>
        </div>
      )}
    </div>
  );
  if (!mapsUrl) return <div className="mt-4">{content}</div>;
  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-4 block transition-transform active:scale-[0.995]"
    >
      {content}
    </a>
  );
}

function TaskHero({
  task,
  onDone,
}: {
  task: Plan["tasks"][number];
  onDone: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.42, ease: EASE }}
      className={cn(
        "rounded-2xl border p-5",
        task.priority === "high"
          ? "border-[var(--color-ember)]/50 bg-[var(--color-ember-soft)]/20"
          : task.priority === "medium"
            ? "border-[var(--color-amber)]/35 bg-[var(--color-amber-soft)]/15"
            : "border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/60",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            task.priority === "high"
              ? "bg-[var(--color-ember)]"
              : task.priority === "medium"
                ? "bg-[var(--color-amber)]"
                : "bg-[var(--color-text-muted)]",
          )}
        />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          {task.priority} · {task.assignedTo}
        </span>
      </div>
      <p className="mt-2 font-display text-[20px] leading-snug tracking-[-0.005em] text-[var(--color-text-primary)]">
        {task.text}
      </p>
      {task.reason && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
          {task.reason}
        </p>
      )}
      <button
        type="button"
        onClick={onDone}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-bg-oled)]/80 px-4 py-3 text-[13.5px] font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-ember)]/50 hover:text-[var(--color-ember)]"
      >
        <Check className="h-4 w-4" strokeWidth={1.75} />
        Mark done
      </button>
    </motion.div>
  );
}

function Progress({
  tasks,
  completed,
  onToggle,
}: {
  tasks: Plan["tasks"];
  completed: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (tasks.length <= 1) return null;
  return (
    <ul className="mt-4 space-y-1">
      {tasks.map((t) => {
        const isDone = completed.has(t.id);
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onToggle(t.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[12.5px] leading-snug transition-colors",
                isDone
                  ? "text-[var(--color-text-muted)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-panel)]/50",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  isDone
                    ? "border-[var(--color-cyan)]/60 bg-[var(--color-cyan)]/20"
                    : "border-[var(--color-line-strong)]",
                )}
              >
                {isDone && (
                  <Check
                    className="h-2.5 w-2.5 text-[var(--color-cyan)]"
                    strokeWidth={2.5}
                  />
                )}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  isDone && "line-through decoration-[var(--color-text-muted)]/50",
                )}
              >
                {t.text}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                {t.priority}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function BigAction({
  href,
  icon: Icon,
  label,
  sub,
  primary = false,
}: {
  href?: string;
  icon: React.ElementType;
  label: string;
  sub: string;
  primary?: boolean;
}) {
  const Content = (
    <div
      className={cn(
        "flex h-14 flex-1 items-center gap-2.5 rounded-2xl px-3.5",
        primary
          ? "bg-[var(--color-ember)] text-[var(--color-bg-oled)]"
          : "border border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 text-[var(--color-text-primary)] backdrop-blur-sm",
      )}
    >
      <Icon
        className={cn("h-4.5 w-4.5 shrink-0", primary && "text-[var(--color-bg-oled)]")}
        strokeWidth={1.75}
      />
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-tight">{label}</p>
        <p
          className={cn(
            "truncate text-[11px] leading-tight",
            primary ? "text-[var(--color-bg-oled)]/70" : "text-[var(--color-text-muted)]",
          )}
        >
          {sub}
        </p>
      </div>
    </div>
  );
  if (!href) return Content;
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      className="flex flex-1 transition-transform active:scale-[0.98]"
    >
      {Content}
    </a>
  );
}

function BriefButton({
  speaking,
  onClick,
}: {
  speaking: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={speaking ? "Stop briefing" : "Speak briefing"}
      className={cn(
        "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border backdrop-blur-sm transition-colors",
        speaking
          ? "border-[var(--color-cyan)]/60 bg-[var(--color-cyan-soft)]/25 text-[var(--color-cyan)]"
          : "border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)]/70 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
      )}
    >
      {speaking ? (
        <>
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-2xl"
            animate={{
              boxShadow: [
                "0 0 0 0 color-mix(in oklab, var(--color-cyan) 45%, transparent)",
                "0 0 0 8px color-mix(in oklab, var(--color-cyan) 0%, transparent)",
              ],
            }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
          <VolumeX className="h-5 w-5" strokeWidth={1.75} />
        </>
      ) : (
        <Volume2 className="h-5 w-5" strokeWidth={1.75} />
      )}
    </button>
  );
}

function buildDemoHousehold(scenarioId: string): Household | null {
  const s = SCENARIOS[scenarioId];
  if (!s) return null;
  const now = new Date().toISOString();
  return {
    id: `demo_${s.id}`,
    createdAt: now,
    updatedAt: now,
    address: `${s.homeLabel}, CA`,
    coords: s.home,
    displayName: `${s.homeLabel} demo`,
    dwelling: "single_family",
    floors: 2,
    accessNotes: "",
    members: [
      { id: "m1", name: "Alex", role: "adult", mobilityNotes: "" },
      { id: "m2", name: "Priya", role: "adult", mobilityNotes: "" },
      { id: "m3", name: "Mia", role: "child", mobilityNotes: "" },
      {
        id: "m4",
        name: "Grandma Rose",
        role: "elder",
        mobilityNotes: "Uses a walker",
      },
    ],
    pets: [{ id: "p1", name: "Luna", species: "dog", carrier: false }],
    medications: [{ id: "md1", name: "Insulin", critical: true }],
    mobilityNotes: "Grandma Rose uses a walker",
    vehicles: [
      { id: "v1", label: "Subaru Outback", seats: 5, fuelState: "half" },
      { id: "v2", label: "Honda Civic", seats: 5, fuelState: "full" },
    ],
    contacts: [
      {
        id: "c1",
        name: "Sister Jen",
        phone: "+1 (818) 555-0142",
        relation: "sibling",
      },
    ],
    destinations: [
      {
        id: "d1",
        label: s.destination.label,
        address: s.destination.address,
        coords: s.destination.coords,
      },
    ],
  };
}
