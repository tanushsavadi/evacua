import type { CrisisEvent, CrisisKind, CrisisSeverity } from "@/lib/schemas/crisis";
import type { LatLng } from "@/lib/geo/types";
import { haversineKm } from "@/lib/utils";

const SEVERITY_WEIGHT: Record<CrisisSeverity, number> = {
  info: 0.1,
  minor: 0.25,
  moderate: 0.5,
  severe: 0.8,
  extreme: 1.0,
};

const KIND_WEIGHT: Record<CrisisKind, number> = {
  evacuation_order: 1.0,
  evacuation_warning: 0.85,
  fire_perimeter: 0.75,
  fire_incident: 0.55,
  road_closure: 0.4,
  red_flag: 0.4,
  weather_alert: 0.35,
  power_shutoff: 0.3,
};

/** Proximity falloff — full weight within 5km, zero past 60km. */
function proximityWeight(distanceKm: number) {
  if (distanceKm <= 5) return 1;
  if (distanceKm >= 60) return 0;
  // smooth cosine falloff
  const t = (distanceKm - 5) / 55;
  return 0.5 * (1 + Math.cos(Math.PI * t));
}

/** Freshness — full within 15 min, decays to 0.4 by 6h, floor at 0.2. */
function freshnessWeight(publishedAt: string) {
  const age = Date.now() - new Date(publishedAt).getTime();
  const hours = age / (1000 * 60 * 60);
  if (hours <= 0.25) return 1;
  if (hours <= 1) return 0.9;
  if (hours <= 3) return 0.7;
  if (hours <= 6) return 0.5;
  return 0.3;
}

/** Build a human rationale for the chip / panel. */
function rationaleFor(ev: CrisisEvent, distanceKm: number) {
  const d = distanceKm.toFixed(1);
  switch (ev.kind) {
    case "evacuation_order":
      return `Mandatory evacuation zone — ${d} km from your home.`;
    case "evacuation_warning":
      return `Evacuation warning area — ${d} km away.`;
    case "fire_perimeter":
      return `Active fire perimeter — ${d} km away.`;
    case "fire_incident":
      return `Active incident — ${d} km away.`;
    case "road_closure":
      return `Road closure near a likely route — ${d} km away.`;
    case "red_flag":
      return `Red flag conditions in your area (wind + low humidity).`;
    case "weather_alert":
      return `Weather alert covering your area.`;
    case "power_shutoff":
      return `Public safety power shutoff expected.`;
    default:
      return `Signal ${d} km from your home.`;
  }
}

export function scoreEvent(ev: CrisisEvent, home: LatLng): CrisisEvent {
  const distanceKm = haversineKm(home, ev.centroid);
  const k = KIND_WEIGHT[ev.kind] ?? 0.3;
  const s = SEVERITY_WEIGHT[ev.severity] ?? 0.3;
  const p = proximityWeight(distanceKm);
  const f = freshnessWeight(ev.publishedAt);
  // Product, lightly sharpened so severe + close + fresh lands near 1.
  const raw = k * s * p * f;
  const impact = Math.min(1, Math.pow(raw, 0.85) * 1.1);
  return {
    ...ev,
    distanceKm,
    impact,
    rationale: rationaleFor(ev, distanceKm),
  };
}

export function scoreAll(events: CrisisEvent[], home: LatLng): CrisisEvent[] {
  return events
    .map((ev) => scoreEvent(ev, home))
    .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0));
}

/** Hysteresis-aware state derivation. */
export function deriveCrisisState(
  scored: CrisisEvent[],
  previous?: "watch" | "prepare" | "leave",
): "watch" | "prepare" | "leave" {
  const top = scored[0]?.impact ?? 0;
  const hasOrder = scored.some(
    (e) => e.kind === "evacuation_order" && (e.distanceKm ?? 99) < 15,
  );
  const hasWarning = scored.some(
    (e) => e.kind === "evacuation_warning" && (e.distanceKm ?? 99) < 20,
  );

  // Thresholds with hysteresis: once we've escalated, stay there until
  // top drops well below threshold.
  const LEAVE_UP = 0.75;
  const LEAVE_DOWN = 0.6;
  const PREP_UP = 0.45;
  const PREP_DOWN = 0.35;

  if (hasOrder || top >= LEAVE_UP) return "leave";
  if (previous === "leave" && top >= LEAVE_DOWN) return "leave";

  if (hasWarning || top >= PREP_UP) return "prepare";
  if (previous === "prepare" && top >= PREP_DOWN) return "prepare";

  return "watch";
}
