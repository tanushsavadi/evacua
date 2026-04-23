import type { LatLng } from "@/lib/schemas/household";

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: Array<{
    summary?: string;
    steps?: Array<{ name?: string; maneuver?: { type?: string } }>;
  }>;
};

type OsrmResponse = { code: string; routes?: OsrmRoute[] };

const OSRM_BASE = "https://router.project-osrm.org";

/** Returns up to `alternatives+1` candidate routes. */
export async function osrmRoutes(
  from: LatLng,
  to: LatLng,
  alternatives = 1,
): Promise<OsrmRoute[]> {
  const url =
    `${OSRM_BASE}/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?alternatives=${alternatives}&overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = (await res.json()) as OsrmResponse;
    if (json.code !== "Ok") return [];
    return json.routes ?? [];
  } catch {
    return [];
  }
}

/** Build a concise road summary from the OSRM leg steps. */
export function roadSummary(route: OsrmRoute, maxParts = 3): string {
  const parts = new Set<string>();
  for (const leg of route.legs) {
    if (leg.summary) {
      for (const s of leg.summary.split(",").map((x) => x.trim())) {
        if (s.length > 1) parts.add(s);
        if (parts.size >= maxParts) break;
      }
    } else if (leg.steps) {
      for (const step of leg.steps) {
        if (step.name && step.name.length > 1) parts.add(step.name);
        if (parts.size >= maxParts) break;
      }
    }
    if (parts.size >= maxParts) break;
  }
  return Array.from(parts).slice(0, maxParts).join(" → ");
}
