import type { CrisisEvent, CrisisKind, CrisisSeverity } from "@/lib/schemas/crisis";

type NwsFeature = {
  id?: string;
  properties: {
    id?: string;
    event?: string;
    severity?: string;
    certainty?: string;
    urgency?: string;
    headline?: string;
    description?: string;
    sent?: string;
    effective?: string;
    expires?: string;
    ends?: string;
    status?: string;
    messageType?: string;
    areaDesc?: string;
    geocode?: Record<string, string[]>;
  };
  geometry?: {
    type: string;
    coordinates: unknown;
  } | null;
};

const KIND_MAP: Record<string, CrisisKind> = {
  "Red Flag Warning": "red_flag",
  "Fire Weather Watch": "red_flag",
  "Extreme Fire Danger": "red_flag",
  "Evacuation Immediate": "evacuation_order",
  "Evacuation Warning": "evacuation_warning",
  "Wildfire Warning": "fire_incident",
  "Wild Fire Statement": "fire_incident",
  "High Wind Warning": "weather_alert",
  "Wind Advisory": "weather_alert",
  "Excessive Heat Warning": "weather_alert",
  "Air Quality Alert": "weather_alert",
};

const SEVERITY_MAP: Record<string, CrisisSeverity> = {
  Extreme: "extreme",
  Severe: "severe",
  Moderate: "moderate",
  Minor: "minor",
  Unknown: "info",
};

function coordsCentroid(geom: NwsFeature["geometry"]): { lat: number; lng: number } | null {
  if (!geom) return null;
  const collect: number[][] = [];
  const visit = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    if (arr.length >= 2 && typeof arr[0] === "number" && typeof arr[1] === "number") {
      collect.push([arr[0] as number, arr[1] as number]);
      return;
    }
    for (const child of arr) visit(child);
  };
  visit(geom.coordinates);
  if (collect.length === 0) return null;
  const lng =
    collect.reduce((a, [x]) => a + x, 0) / collect.length;
  const lat =
    collect.reduce((a, [, y]) => a + y, 0) / collect.length;
  return { lat, lng };
}

export async function fetchNwsAlerts(opts: {
  lat: number;
  lng: number;
  radiusKm?: number;
}): Promise<CrisisEvent[]> {
  // We currently fetch all active CA alerts and let the impact scorer
  // apply proximity falloff against the supplied operations center coords.
  void opts;
  const url =
    "https://api.weather.gov/alerts/active?area=CA&limit=200";
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        process.env.NOMINATIM_UA ?? "Evacua/0.1 (https://evacua.app)",
      Accept: "application/geo+json",
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    features?: NwsFeature[];
  };
  const features = data.features ?? [];

  const out: CrisisEvent[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const event = p.event ?? "";
    const kind: CrisisKind = KIND_MAP[event] ?? "weather_alert";
    const centroid = coordsCentroid(f.geometry);
    if (!centroid) continue;
    const severity: CrisisSeverity = SEVERITY_MAP[p.severity ?? "Unknown"] ?? "minor";
    out.push({
      id: `nws:${p.id ?? f.id ?? Math.random().toString(36).slice(2)}`,
      source: "nws",
      kind,
      severity,
      headline: p.headline ?? event,
      body: (p.description ?? "").slice(0, 600),
      publishedAt: p.sent ?? p.effective ?? new Date().toISOString(),
      expiresAt: p.expires ?? p.ends,
      url: "https://www.weather.gov/",
      centroid,
    });
  }
  return out;
}
