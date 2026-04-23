import Anthropic from "@anthropic-ai/sdk";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { Household } from "@/lib/schemas/household";
import type { Plan, PlanTask, RouteGeometry } from "@/lib/schemas/plan";
import { PlanSchema } from "@/lib/schemas/plan";
import { osrmRoutes, roadSummary } from "@/lib/router/osrm";
import { haversineKm } from "@/lib/utils";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-5";

type PlanInputs = {
  household: Household;
  events: CrisisEvent[];
  state: "watch" | "prepare" | "leave";
};

/** Deterministic planner — the baseline Evacua always gives. */
export function deterministicPlan({
  household,
  events,
  state,
}: PlanInputs): Omit<Plan, "routes" | "primaryRouteId" | "backupRouteId"> & {
  tasks: PlanTask[];
} {
  const now = new Date();
  const leaveByMs =
    state === "leave"
      ? now.getTime() + 15 * 60 * 1000
      : state === "prepare"
        ? now.getTime() + 60 * 60 * 1000
        : null;

  const primary = household.destinations[0];
  const destination = primary
    ? {
        label: primary.label || "Preferred destination",
        address: primary.address,
        coords:
          primary.coords ??
          ({ lat: household.coords.lat + 0.3, lng: household.coords.lng + 0.2 } as const),
      }
    : {
        label: "Further inland",
        address: "Drive east on the largest open highway",
        coords: { lat: household.coords.lat, lng: household.coords.lng + 0.6 },
      };

  const tasks: PlanTask[] = [];
  const t = (
    assignedTo: string,
    text: string,
    priority: "high" | "medium" | "low" = "medium",
    reason?: string,
  ) => {
    tasks.push({
      id: `t_${tasks.length + 1}`,
      assignedTo,
      text,
      priority,
      reason,
    });
  };

  if (state === "watch") {
    t("all", "Keep phones charged and vehicles fueled.", "low");
    t("adult", "Stage a go-bag near the door (3 days water + meds + IDs).", "medium");
    t("all", "Review the meeting point with your household.", "low");
    if (household.medications.some((m) => m.critical)) {
      t(
        "adult",
        "Confirm critical meds are packed and in-date (insulin, inhalers, EpiPens).",
        "medium",
      );
    }
  } else if (state === "prepare") {
    t("adult", `Move both vehicles so they point toward the exit.`, "high");
    t(
      "adult",
      "Load go-bags, critical meds, passports, and external drives into the primary vehicle.",
      "high",
    );
    if (household.pets.length > 0) {
      t(
        "adult",
        `Get pets (${household.pets.map((p) => p.name).join(", ")}) into carriers near the door.`,
        "high",
      );
    }
    if (household.medications.some((m) => m.critical)) {
      t("adult", "Pack a 7-day supply of critical medications.", "high");
    }
    if (
      household.members.some(
        (m) => m.role === "elder" || (m.mobilityNotes ?? "").length > 0,
      )
    ) {
      t(
        "adult",
        "Help household members with mobility needs get shoes + jackets on now.",
        "high",
      );
    }
    t("teen", "Close exterior vents and windows. Move flammables away from walls.", "medium");
    t("child", "Fill water bottles. Put a charged phone in every go-bag.", "low");
  } else {
    // leave
    t("adult", "Leave now. Take the primary route. Do not return.", "high");
    if (household.pets.length > 0) {
      t("adult", `Put pets (${household.pets.map((p) => p.name).join(", ")}) in the car.`, "high");
    }
    if (household.medications.some((m) => m.critical)) {
      t("adult", "Confirm critical meds are in the lead vehicle.", "high");
    }
    t(
      "adult",
      "Call the listed emergency contact so they know you are moving.",
      "high",
    );
    t("teen", "Turn off gas at the shutoff if safe and time permits.", "medium");
    t("all", "Drive with headlights on. Do not stop for belongings.", "high");
  }

  const topEvents = events.slice(0, 4);
  const citations = Array.from(new Set(topEvents.map((e) => e.source)));

  const headline =
    state === "leave"
      ? "Leave now. Take your primary route."
      : state === "prepare"
        ? "Move to ready. Leave in the next hour if ordered."
        : "Conditions are quiet. Evacua is watching the signals for you.";

  const reasoning =
    topEvents.length === 0
      ? "No high-impact signals within the household's scoring radius."
      : `Posture driven by ${topEvents
          .slice(0, 2)
          .map((e) => e.headline)
          .join(" and ")}. ` +
        `Closest is ${Math.round(topEvents[0]!.distanceKm ?? 0)} km away.`;

  const confidence =
    state === "watch" ? 0.9 : state === "prepare" ? 0.8 : 0.85;

  return {
    id: `plan_${Math.random().toString(36).slice(2, 10)}`,
    version: 1,
    generatedAt: now.toISOString(),
    state,
    leaveByIso: leaveByMs ? new Date(leaveByMs).toISOString() : null,
    destination,
    tasks,
    headline,
    reasoning,
    citations,
    confidence,
    author: "fallback",
  };
}

/** Call Opus 4.7 to narrate/refine tasks and reasoning. */
async function enhanceWithOpus(
  base: ReturnType<typeof deterministicPlan>,
  inputs: PlanInputs,
): Promise<{ headline: string; reasoning: string; tasks: PlanTask[] } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });

  const system = `You are Evacua's Plan Agent.

You receive a household profile, a set of scored crisis events, and a baseline plan.
You produce one JSON object with:
  - headline: a single calm, direct sentence (<= 90 chars)
  - reasoning: 1-2 sentences explaining current posture in plain language, no jargon
  - tasks: an array of { id, assignedTo, text, priority, reason } ordered by priority

Rules:
- Never invent road names, neighborhoods, or zones that aren't in the inputs.
- Speak like a trusted neighbor who plans for a living. No alarmism.
- Reflect the household (roles, pets, meds, mobility) in task text.
- Keep task "text" under 120 chars. Use "assignedTo" values from: "all", "adult", "teen", "child", "elder", or a specific member name from the household.
- Return ONLY valid JSON. No markdown, no prose outside JSON.`;

  const user = JSON.stringify({
    household: {
      coords: inputs.household.coords,
      address: inputs.household.address,
      dwelling: inputs.household.dwelling,
      members: inputs.household.members,
      pets: inputs.household.pets,
      medications: inputs.household.medications,
      vehicles: inputs.household.vehicles,
      destinations: inputs.household.destinations,
      mobilityNotes: inputs.household.mobilityNotes,
    },
    state: inputs.state,
    events: inputs.events.slice(0, 6).map((e) => ({
      source: e.source,
      kind: e.kind,
      severity: e.severity,
      headline: e.headline,
      distanceKm: e.distanceKm,
      impact: e.impact,
    })),
    baseline: {
      headline: base.headline,
      reasoning: base.reasoning,
      tasks: base.tasks,
    },
  });

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Be forgiving — accept a JSON block anywhere in the output.
    const match = text.match(/\{[\s\S]*\}$/) ?? text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      headline?: string;
      reasoning?: string;
      tasks?: PlanTask[];
    };
    if (!parsed.headline || !parsed.reasoning || !Array.isArray(parsed.tasks)) {
      return null;
    }
    return {
      headline: parsed.headline.slice(0, 140),
      reasoning: parsed.reasoning.slice(0, 400),
      tasks: parsed.tasks
        .filter(
          (t): t is PlanTask =>
            typeof t === "object" &&
            t !== null &&
            typeof (t as PlanTask).text === "string",
        )
        .map((t, i) => ({
          id: t.id ?? `t_${i + 1}`,
          assignedTo: t.assignedTo ?? "all",
          text: t.text,
          priority: t.priority ?? "medium",
          reason: t.reason,
        }))
        .slice(0, 10),
    };
  } catch {
    return null;
  }
}

export async function generatePlan(inputs: PlanInputs): Promise<Plan> {
  const base = deterministicPlan(inputs);
  const enhanced = await enhanceWithOpus(base, inputs);

  // Fetch routes to the destination
  const osrm = await osrmRoutes(
    inputs.household.coords,
    base.destination.coords,
    1,
  );

  const routes: RouteGeometry[] = osrm.map((r, i) => ({
    id: i === 0 ? "primary" : `alt_${i}`,
    label: i === 0 ? "Primary" : `Alternate ${i}`,
    summary: roadSummary(r) || "Fastest route",
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
    via: roadSummary(r) || undefined,
    coordinates: r.geometry.coordinates,
  }));

  // Fallback synthetic route if OSRM fails entirely
  if (routes.length === 0) {
    const d = haversineKm(inputs.household.coords, base.destination.coords);
    routes.push({
      id: "primary",
      label: "Primary",
      summary: "Head toward the destination on the largest open road.",
      distanceKm: d,
      durationMin: Math.max(10, d * 1.5),
      coordinates: [
        [inputs.household.coords.lng, inputs.household.coords.lat],
        [base.destination.coords.lng, base.destination.coords.lat],
      ],
    });
  }

  const candidate: Plan = {
    ...base,
    headline: enhanced?.headline ?? base.headline,
    reasoning: enhanced?.reasoning ?? base.reasoning,
    tasks: enhanced?.tasks ?? base.tasks,
    routes,
    primaryRouteId: routes[0]!.id,
    backupRouteId: routes[1]?.id,
    author: enhanced ? "opus" : "fallback",
  };

  const parsed = PlanSchema.safeParse(candidate);
  if (!parsed.success) {
    // As a last resort, return the parsed baseline without enhancement
    return PlanSchema.parse({
      ...base,
      routes,
      primaryRouteId: routes[0]!.id,
      backupRouteId: routes[1]?.id,
      author: "fallback",
    });
  }
  return parsed.data;
}
