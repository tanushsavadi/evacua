import type { CrisisEvent } from "@/lib/schemas/crisis";

type SupabaseError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

type SupabaseIncident = {
  id: string;
  name: string | null;
  status: "active" | "contained" | "extinguished" | null;
  risk: "low" | "medium" | "high" | "critical" | null;
  lat: number | string | null;
  lon: number | string | null;
  containment: number | string | null;
  start_time: string | null;
  last_update: string | null;
  description: string | null;
};

type SupabaseFirestation = {
  id: number;
  name: string;
  city: string | null;
  county: string | null;
  lat: number | string;
  lon: number | string;
};

type SupabaseResponder = {
  id: string;
  firestation_id: number;
  incident_id: string | null;
  team_number: number;
  status: "available" | "dispatched" | "en_route" | "on_scene" | "returning";
  current_lat: number | string | null;
  current_lon: number | string | null;
  dispatched_at: string | null;
  arrived_at?: string | null;
  updated_at?: string | null;
  incidents?: SupabaseIncident | null;
  firestations?: Pick<SupabaseFirestation, "name" | "city" | "county"> | null;
};

type SupabaseResponderStat = {
  firestation_id: number;
  firestation_name: string;
  available_teams?: number | string | null;
  dispatched_teams?: number | string | null;
  active_teams?: number | string | null;
  total_teams?: number | string | null;
  total_teams_runtime?: number | string | null;
  total_teams_configured?: number | string | null;
};

export type FireStateIncident = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  polygon_coords: [number, number][];
  estimated_radius: number;
  growth_rate: number;
  risk_level: "low" | "medium" | "high" | "critical";
  containment: number;
  last_update: string;
  description: string;
};

export type FireStateSnapshot = {
  fires: FireStateIncident[];
  firestations: Array<{
    id: number;
    name: string;
    city: string;
    county: string;
    lat: number;
    lon: number;
    active_route: unknown;
  }>;
  timestamp: string;
  count: {
    active_fires: number;
    firestations: number;
  };
};

export type ResponderStatsSnapshot = {
  stats: Array<{
    firestation_id: number;
    firestation_name: string;
    available_teams: number;
    dispatched_teams: number;
    active_teams: number;
    total_teams: number;
  }>;
  activeResponders: Array<
    SupabaseResponder & {
      stationId: number;
      teamNumber: number;
      incidentId: string | null;
      dispatchedAt: string | null;
      etaIso: string | null;
    }
  >;
  totals: {
    available: number;
    dispatched: number;
    active: number;
    total: number;
  };
};

export type RouteOpsSnapshot = {
  routes: Array<{
    id: string;
    station_id: number;
    station_name?: string;
    fire_id?: string;
    fire_name?: string;
    original_route: unknown;
    new_route: unknown;
    reason: string;
    risk_score: number | null;
    created_at: string;
  }>;
  evacuations: Array<{
    id: string;
    fire_id: string;
    zone_name: string | null;
    polygon: unknown;
    recommended_at: string;
  }>;
  timestamp: string;
};

export type AgentOpsSnapshot = {
  status: "complete";
  scannedAt: string;
  firesAnalyzed: number;
  stationsAnalyzed: number;
  findings: Array<{
    id: string;
    type: "route_risk" | "evacuation_zone";
    severity: "watch" | "high" | "critical";
    fireId: string;
    fireName: string;
    stationId?: number;
    stationName?: string;
    riskScore?: number;
    distanceKm?: number;
    reason: string;
  }>;
  createdRouteUpdates: RouteOpsSnapshot["routes"];
  createdEvacuations: RouteOpsSnapshot["evacuations"];
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEMO_MODE_SETTING =
  process.env.EVACUA_DEMO_MODE ?? process.env.NEXT_PUBLIC_EVACUA_DEMO_MODE;

const DEMO_FIRESTATIONS: SupabaseFirestation[] = [
  {
    id: 1,
    name: "Madera County Station 8",
    city: "Oakhurst",
    county: "Madera",
    lat: 37.3282,
    lon: -119.6493,
  },
  {
    id: 2,
    name: "Redwood Valley Station 54",
    city: "Redwood Valley",
    county: "Mendocino",
    lat: 39.2864,
    lon: -123.2028,
  },
  {
    id: 3,
    name: "Fresno-Kings Staging",
    city: "Fresno",
    county: "Fresno",
    lat: 36.7477,
    lon: -119.7724,
  },
];

const demoRouteUpdates: RouteOpsSnapshot["routes"] = [];
const demoEvacuations: RouteOpsSnapshot["evacuations"] = [];
type DemoDispatchedResponder = SupabaseResponder & {
  firestation_name: string;
  estimated_arrival: string;
  estimated_duration: number;
};
const demoDispatchedResponders: DemoDispatchedResponder[] = [];
let demoSequence = 0;

class SupabaseConfigError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}

function assertSupabaseConfig() {
  if (!hasSupabaseConfig()) throw new SupabaseConfigError();
}

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function demoDataEnabled() {
  if (DEMO_MODE_SETTING === "false" || DEMO_MODE_SETTING === "0") return false;
  return DEMO_MODE_SETTING === "true" || DEMO_MODE_SETTING === "1" || !hasSupabaseConfig();
}

export function getOpsDataMode() {
  return demoDataEnabled() ? "demo" : "supabase";
}

export function resetDemoOperationsState() {
  demoRouteUpdates.length = 0;
  demoEvacuations.length = 0;
  demoDispatchedResponders.length = 0;
  demoSequence = 0;
}

function endpoint(table: string, params?: Record<string, string | number | null | undefined>) {
  assertSupabaseConfig();
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function rest<T>(
  table: string,
  params?: Record<string, string | number | null | undefined>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(endpoint(table, params), {
    ...init,
    headers: {
      apikey: SUPABASE_KEY!,
      authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as SupabaseError | null;
    throw new Error(payload?.message ?? `Supabase ${table} request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function n(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toRad(v: number) {
  return (v * Math.PI) / 180;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function riskToSeverity(risk: FireStateIncident["risk_level"]): CrisisEvent["severity"] {
  if (risk === "critical") return "extreme";
  if (risk === "high") return "severe";
  if (risk === "medium") return "moderate";
  return "minor";
}

function riskToImpact(risk: FireStateIncident["risk_level"], containment: number) {
  const base = risk === "critical" ? 0.92 : risk === "high" ? 0.72 : risk === "medium" ? 0.48 : 0.28;
  return clamp(base - containment / 240, 0.1, 1);
}

function circularPolygon(centerLat: number, centerLon: number, radiusMeters: number, points = 8) {
  const polygon: [number, number][] = [];
  const cosLat = Math.max(0.15, Math.cos((centerLat * Math.PI) / 180));

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const latOffset = (radiusMeters / 111320) * Math.cos(angle);
    const lonOffset = (radiusMeters / (111320 * cosLat)) * Math.sin(angle);
    polygon.push([centerLon + lonOffset, centerLat + latOffset]);
  }
  if (polygon.length) polygon.push(polygon[0]);
  return polygon;
}

function demoIso(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function nextDemoId(prefix: string) {
  demoSequence += 1;
  return `${prefix}-${Date.now()}-${demoSequence}`;
}

function demoIncidents(): SupabaseIncident[] {
  return [
    {
      id: "demo-pine-ridge-fire",
      name: "Pine Ridge Fire",
      status: "active",
      risk: "critical",
      lat: 37.2897,
      lon: -119.5272,
      containment: 14,
      start_time: demoIso(95),
      last_update: demoIso(2),
      description: "Fast-moving timber and brush fire with wind-driven spread toward ridge communities.",
    },
    {
      id: "demo-redwood-valley-fire",
      name: "Redwood Valley Fire",
      status: "active",
      risk: "high",
      lat: 39.2594,
      lon: -123.2047,
      containment: 31,
      start_time: demoIso(160),
      last_update: demoIso(4),
      description: "Active perimeter expansion near mixed woodland and rural road corridors.",
    },
  ];
}

function demoRespondersOnScene(): Array<Pick<SupabaseResponder, "incident_id" | "status">> {
  const base = [
    {
      incident_id: "demo-redwood-valley-fire",
      status: "on_scene" as const,
    },
  ];
  const dispatched = demoDispatchedResponders.map(r => ({
    incident_id: r.incident_id,
    status: "en_route" as const
  }));
  return [...base, ...dispatched];
}

function isOperationalIncident(incident: SupabaseIncident) {
  const id = String(incident.id ?? "").toLowerCase();
  const name = (incident.name ?? "").trim().toLowerCase();
  const description = (incident.description ?? "").trim().toLowerCase();
  const lat = n(incident.lat, Number.NaN);
  const lon = n(incident.lon, Number.NaN);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return false;
  }

  if (!name) return false;
  if (id.includes("demo-test") || description === "test description") return false;
  return !/\b(test|mock|sample|dummy)\b/.test(name);
}

function buildFireStateSnapshot(
  incidents: SupabaseIncident[],
  firestations: SupabaseFirestation[],
  respondersOnScene: Array<Pick<SupabaseResponder, "incident_id" | "status">>,
): FireStateSnapshot {
  const respondersByIncident = new Map<string, number>();
  for (const responder of respondersOnScene) {
    if (!responder.incident_id) continue;
    respondersByIncident.set(
      String(responder.incident_id),
      (respondersByIncident.get(String(responder.incident_id)) ?? 0) + 1,
    );
  }

  const fires = incidents.filter(isOperationalIncident).map((incident) => {
    const risk = incident.risk ?? "medium";
    const startTime = Date.parse(incident.start_time ?? incident.last_update ?? "");
    const elapsedMinutes = Number.isFinite(startTime)
      ? Math.max(0, (Date.now() - startTime) / 60_000)
      : 0;
    const growthRate = { critical: 50, high: 35, medium: 20, low: 10 }[risk] ?? 20;
    const containment = clamp(n(incident.containment), 0, 100);
    const responders = respondersByIncident.get(String(incident.id)) ?? 0;
    const maxRadius = Math.min(elapsedMinutes * growthRate, 5000);
    const estimatedRadius =
      responders > 0 ? maxRadius * (1 - (containment / 100) * 0.95) : maxRadius;
    const lat = n(incident.lat);
    const lon = n(incident.lon);

    return {
      id: String(incident.id),
      name: incident.name ?? "Unnamed Fire",
      lat,
      lon,
      polygon_coords: circularPolygon(lat, lon, estimatedRadius),
      estimated_radius: estimatedRadius,
      growth_rate: growthRate,
      risk_level: risk,
      containment,
      last_update: incident.last_update ?? new Date().toISOString(),
      description: incident.description ?? "",
    } satisfies FireStateIncident;
  });

  const formattedStations = firestations.map((station) => ({
    id: Number(station.id),
    name: station.name,
    lat: n(station.lat),
    lon: n(station.lon),
    city: station.city ?? "",
    county: station.county ?? "",
    active_route: null,
  }));

  return {
    fires,
    firestations: formattedStations,
    timestamp: new Date().toISOString(),
    count: {
      active_fires: fires.length,
      firestations: formattedStations.length,
    },
  };
}

function buildDemoFireState(): FireStateSnapshot {
  return buildFireStateSnapshot(demoIncidents(), DEMO_FIRESTATIONS, demoRespondersOnScene());
}

export async function buildFireStateFromSupabase(): Promise<FireStateSnapshot> {
  if (demoDataEnabled()) return buildDemoFireState();

  const [incidents, firestations, respondersOnScene] = await Promise.all([
    rest<SupabaseIncident[]>("incidents", {
      select: "*",
      status: "eq.active",
      order: "last_update.desc",
    }),
    rest<SupabaseFirestation[]>("firestations", {
      select: "*",
      order: "id.asc",
    }),
    rest<Array<Pick<SupabaseResponder, "incident_id" | "status">>>("responders", {
      select: "incident_id,status",
      status: "in.(on_scene)",
    }).catch(() => []),
  ]);

  return buildFireStateSnapshot(incidents, firestations, respondersOnScene);
}

export function fireStateToEvents(fireState: FireStateSnapshot): CrisisEvent[] {
  return fireState.fires.map((fire) => {
    const impact = riskToImpact(fire.risk_level, fire.containment);
    const severity = riskToSeverity(fire.risk_level);
    return {
      id: fire.id,
      source: "calfire",
      kind: "fire_incident",
      severity,
      headline: fire.name,
      body: fire.description,
      publishedAt: fire.last_update,
      centroid: { lat: fire.lat, lng: fire.lon },
      polygon: fire.polygon_coords.length ? [fire.polygon_coords] : undefined,
      impact,
      rationale: `${fire.risk_level} risk wildfire, ${Math.round(
        fire.containment,
      )}% contained, estimated radius ${(fire.estimated_radius / 1000).toFixed(1)} km.`,
    } satisfies CrisisEvent;
  });
}

async function fetchMapboxRoute(
  station: { lat: number; lon: number },
  incident: { lat: number; lon: number },
) {
  const distanceKm = haversineKm(station.lat, station.lon, incident.lat, incident.lon);
  const fallback = {
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [station.lon, station.lat],
        [incident.lon, incident.lat],
      ],
    },
    distance: Math.round(distanceKm * 1000),
    duration: Math.max(180, Math.round((distanceKm / 55) * 3600)),
  };

  const token =
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) return fallback;

  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${station.lon},${station.lat};${incident.lon},${incident.lat}` +
      `?geometries=geojson&access_token=${token}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      routes?: Array<{
        geometry?: { type: "LineString"; coordinates: [number, number][] };
        distance?: number;
        duration?: number;
      }>;
    };
    const route = data.routes?.[0];
    if (!route?.geometry) return fallback;
    return {
      geometry: route.geometry,
      distance: route.distance ?? fallback.distance,
      duration: route.duration ?? fallback.duration,
    };
  } catch {
    return fallback;
  }
}

async function dispatchDemoResponder(input: {
  incidentId: string;
  incidentLat: number;
  incidentLon: number;
}) {
  let nearestStation = DEMO_FIRESTATIONS[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const station of DEMO_FIRESTATIONS) {
    const distance = haversineKm(input.incidentLat, input.incidentLon, n(station.lat), n(station.lon));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStation = station;
    }
  }

  const dispatchedAt = new Date().toISOString();
  const route = await fetchMapboxRoute(
    { lat: n(nearestStation.lat), lon: n(nearestStation.lon) },
    { lat: input.incidentLat, lon: input.incidentLon },
  );
  const eta = new Date(Date.now() + route.duration * 1000).toISOString();

  const responder = {
    id: `demo-responder-${nearestStation.id}-${Date.now()}`,
    firestation_id: Number(nearestStation.id),
    firestation_name: nearestStation.name,
    team_number: Math.floor(Math.random() * 5) + 1,
    incident_id: input.incidentId,
    dispatched_at: dispatchedAt,
    estimated_arrival: eta,
    estimated_duration: route.duration,
    status: "en_route" as const,
    current_lat: n(nearestStation.lat),
    current_lon: n(nearestStation.lon),
  };

  demoDispatchedResponders.push(responder);

  return {
    responder,
    route,
    station: {
      lat: n(nearestStation.lat),
      lon: n(nearestStation.lon),
      name: nearestStation.name,
    },
    incident: {
      lat: input.incidentLat,
      lon: input.incidentLon,
    },
  };
}

export async function dispatchResponder(input: {
  incidentId: string;
  incidentLat: number;
  incidentLon: number;
}) {
  if (demoDataEnabled()) return dispatchDemoResponder(input);

  const [firestations, availableResponders] = await Promise.all([
    rest<SupabaseFirestation[]>("firestations", { select: "*" }),
    rest<SupabaseResponder[]>("responders", {
      select: "*",
      status: "eq.available",
      order: "team_number.asc",
    }),
  ]);

  let nearestStation: SupabaseFirestation | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const station of firestations) {
    const hasResponder = availableResponders.some(
      (responder) => Number(responder.firestation_id) === Number(station.id),
    );
    if (!hasResponder) continue;
    const distance = haversineKm(input.incidentLat, input.incidentLon, n(station.lat), n(station.lon));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStation = station;
    }
  }

  if (!nearestStation) return null;

  const responder = availableResponders
    .filter((row) => Number(row.firestation_id) === Number(nearestStation.id))
    .sort((a, b) => Number(a.team_number) - Number(b.team_number))[0];

  if (!responder) return null;

  const dispatchedAt = new Date().toISOString();
  await rest<SupabaseResponder[]>(
    "responders",
    { id: `eq.${responder.id}` },
    {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        status: "dispatched",
        incident_id: input.incidentId,
        dispatched_at: dispatchedAt,
        current_lat: n(nearestStation.lat),
        current_lon: n(nearestStation.lon),
      }),
    },
  );

  const route = await fetchMapboxRoute(
    { lat: n(nearestStation.lat), lon: n(nearestStation.lon) },
    { lat: input.incidentLat, lon: input.incidentLon },
  );
  const eta = new Date(Date.now() + route.duration * 1000).toISOString();

  return {
    responder: {
      id: responder.id,
      firestation_id: Number(responder.firestation_id),
      firestation_name: nearestStation.name,
      team_number: Number(responder.team_number),
      incident_id: input.incidentId,
      dispatched_at: dispatchedAt,
      estimated_arrival: eta,
      estimated_duration: route.duration,
    },
    route,
    station: {
      lat: n(nearestStation.lat),
      lon: n(nearestStation.lon),
      name: nearestStation.name,
    },
    incident: {
      lat: input.incidentLat,
      lon: input.incidentLon,
    },
  };
}

function getDemoResponderStats(): ResponderStatsSnapshot {
  const incidents = demoIncidents();
  const pine = incidents[0];
  const redwood = incidents[1];
  const [station1, station2] = DEMO_FIRESTATIONS;
  const pineDispatch = demoIso(7);
  const redwoodArrival = demoIso(18);

  const baseActiveResponders: ResponderStatsSnapshot["activeResponders"] = [
    {
      id: "demo-responder-1-1",
      firestation_id: station1.id,
      incident_id: pine.id,
      team_number: 1,
      status: "en_route",
      current_lat: station1.lat as number,
      current_lon: station1.lon as number,
      dispatched_at: pineDispatch,
      arrived_at: null,
      updated_at: demoIso(1),
      incidents: pine,
      firestations: {
        name: station1.name,
        city: station1.city,
        county: station1.county,
      },
      stationId: station1.id,
      teamNumber: 1,
      incidentId: pine.id,
      dispatchedAt: pineDispatch,
      etaIso: new Date(Date.now() + 9 * 60_000).toISOString(),
    },
    {
      id: "demo-responder-2-1",
      firestation_id: station2.id,
      incident_id: redwood.id,
      team_number: 1,
      status: "on_scene",
      current_lat: redwood.lat as number,
      current_lon: redwood.lon as number,
      dispatched_at: demoIso(42),
      arrived_at: redwoodArrival,
      updated_at: demoIso(2),
      incidents: redwood,
      firestations: {
        name: station2.name,
        city: station2.city,
        county: station2.county,
      },
      stationId: station2.id,
      teamNumber: 1,
      incidentId: redwood.id,
      dispatchedAt: demoIso(42),
      etaIso: redwoodArrival,
    },
  ];

  const dynamicResponders = demoDispatchedResponders.map((r) => {
    const station = DEMO_FIRESTATIONS.find((s) => s.id === r.firestation_id) || station1;
    const incident = incidents.find((f) => f.id === r.incident_id) || pine;
    return {
      ...r,
      incidents: incident,
      firestations: {
        name: station.name,
        city: station.city,
        county: station.county,
      },
      stationId: r.firestation_id,
      teamNumber: r.team_number,
      incidentId: r.incident_id,
      dispatchedAt: r.dispatched_at,
      etaIso: r.estimated_arrival,
    };
  });

  const activeResponders = [...baseActiveResponders, ...dynamicResponders];

  const stats = DEMO_FIRESTATIONS.map((station) => {
    const stationResponders = activeResponders.filter((r) => r.firestation_id === station.id);
    const dispatchedCount = stationResponders.filter((r) => r.status === "en_route" || r.status === "dispatched").length;
    const activeCount = stationResponders.filter((r) => r.status === "on_scene").length;
    const totalCount = 3;
    const availableCount = Math.max(0, totalCount - dispatchedCount - activeCount);

    return {
      firestation_id: station.id,
      firestation_name: station.name,
      available_teams: availableCount,
      dispatched_teams: dispatchedCount,
      active_teams: activeCount,
      total_teams: totalCount,
    };
  });

  const totals = stats.reduce(
    (acc, s) => ({
      available: acc.available + s.available_teams,
      dispatched: acc.dispatched + s.dispatched_teams,
      active: acc.active + s.active_teams,
      total: acc.total + s.total_teams,
    }),
    { available: 0, dispatched: 0, active: 0, total: 0 },
  );

  return {
    stats,
    activeResponders,
    totals,
  };
}

export async function getResponderStats(): Promise<ResponderStatsSnapshot> {
  if (demoDataEnabled()) return getDemoResponderStats();

  const [stats, activeRows] = await Promise.all([
    rest<SupabaseResponderStat[]>("responder_stats", { select: "*" }).catch(() => []),
    rest<SupabaseResponder[]>("responders", {
      select: "*,incidents(*),firestations(name,city,county)",
      status: "in.(dispatched,en_route,on_scene)",
    }).catch(() => []),
  ]);

  const normalizedStats = stats.map((row) => {
    const available = n(row.available_teams);
    const dispatched = n(row.dispatched_teams);
    const active = n(row.active_teams);
    const total =
      n(row.total_teams, Number.NaN) ||
      n(row.total_teams_runtime, Number.NaN) ||
      n(row.total_teams_configured, Number.NaN) ||
      available + dispatched + active;
    return {
      firestation_id: Number(row.firestation_id),
      firestation_name: row.firestation_name,
      available_teams: available,
      dispatched_teams: dispatched,
      active_teams: active,
      total_teams: Number.isFinite(total) ? total : available + dispatched + active,
    };
  });

  const activeResponders = activeRows.map((row) => {
    const fallbackEta = row.dispatched_at
      ? new Date(Date.parse(row.dispatched_at) + 15 * 60_000).toISOString()
      : null;
    return {
      ...row,
      stationId: Number(row.firestation_id),
      teamNumber: Number(row.team_number),
      incidentId: row.incident_id ? String(row.incident_id) : null,
      dispatchedAt: row.dispatched_at,
      etaIso: row.status === "on_scene" ? row.arrived_at ?? fallbackEta : fallbackEta,
    };
  });

  return {
    stats: normalizedStats,
    activeResponders,
    totals: {
      available: normalizedStats.reduce((sum, row) => sum + row.available_teams, 0),
      dispatched: normalizedStats.reduce((sum, row) => sum + row.dispatched_teams, 0),
      active: normalizedStats.reduce((sum, row) => sum + row.active_teams, 0),
      total: normalizedStats.reduce((sum, row) => sum + row.total_teams, 0),
    },
  };
}

export async function listRecentRouteUpdates(windowMs = 5 * 60_000): Promise<RouteOpsSnapshot> {
  if (demoDataEnabled()) {
    const fireState = buildDemoFireState();
    const [fire] = fireState.fires;
    const [station] = fireState.firestations;
    const defaults: RouteOpsSnapshot["routes"] = [
      {
        id: "demo-route-pine-ridge-station-1",
        station_id: station.id,
        station_name: station.name,
        fire_id: fire.id,
        fire_name: fire.name,
        original_route: null,
        new_route: calculateAlternativeRoute(station, fire),
        reason: `${fire.name} is spreading toward ${station.name}. Use ridge-adjacent alternate staging route.`,
        risk_score: 1.7,
        created_at: demoIso(3),
      },
    ];
    const defaultEvacuations: RouteOpsSnapshot["evacuations"] = [
      {
        id: "demo-evac-pine-ridge",
        fire_id: fire.id,
        zone_name: `${fire.name} Evacuation Zone`,
        polygon: calculateEvacuationPolygon(fire),
        recommended_at: demoIso(5),
      },
    ];
    const cutoff = Date.now() - windowMs;
    return {
      routes: [...demoRouteUpdates, ...defaults].filter(
        (route) => Date.parse(route.created_at) >= cutoff,
      ),
      evacuations: [...demoEvacuations, ...defaultEvacuations].filter(
        (zone) => Date.parse(zone.recommended_at) >= cutoff,
      ),
      timestamp: new Date().toISOString(),
    };
  }

  const threshold = new Date(Date.now() - windowMs).toISOString();
  const [routes, evacuations] = await Promise.all([
    rest<RouteOpsSnapshot["routes"]>("route_updates", {
      select: "*",
      created_at: `gte.${threshold}`,
      order: "created_at.desc",
    }).catch(() => []),
    rest<RouteOpsSnapshot["evacuations"]>("evacuation_zones", {
      select: "*",
      recommended_at: `gte.${threshold}`,
      order: "recommended_at.desc",
    }).catch(() => []),
  ]);

  return {
    routes,
    evacuations,
    timestamp: new Date().toISOString(),
  };
}

export async function createRouteUpdate(input: {
  station_id: number;
  station_name?: string;
  fire_id?: string;
  fire_name?: string;
  original_route?: unknown;
  new_route: unknown;
  reason?: string;
  risk_score?: number | null;
}) {
  if (demoDataEnabled()) {
    const route = {
      id: nextDemoId("demo-route"),
      station_id: input.station_id,
      station_name: input.station_name,
      fire_id: input.fire_id,
      fire_name: input.fire_name,
      original_route: input.original_route ?? null,
      new_route: input.new_route,
      reason: input.reason ?? "Demo route adjustment",
      risk_score: input.risk_score ?? null,
      created_at: new Date().toISOString(),
    } satisfies RouteOpsSnapshot["routes"][number];
    demoRouteUpdates.unshift(route);
    return route;
  }

  const rows = await rest<RouteOpsSnapshot["routes"]>(
    "route_updates",
    { select: "*" },
    {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        station_id: input.station_id,
        station_name: input.station_name,
        fire_id: input.fire_id,
        fire_name: input.fire_name,
        original_route: input.original_route ?? null,
        new_route: input.new_route,
        reason: input.reason ?? "AI-recommended route adjustment",
        risk_score: input.risk_score ?? null,
      }),
    },
  );
  return rows[0];
}

export async function createEvacuationZone(input: {
  fire_id: string;
  zone_name?: string;
  polygon: unknown;
}) {
  if (demoDataEnabled()) {
    const zone = {
      id: nextDemoId("demo-evac"),
      fire_id: input.fire_id,
      zone_name: input.zone_name ?? null,
      polygon: input.polygon,
      recommended_at: new Date().toISOString(),
    } satisfies RouteOpsSnapshot["evacuations"][number];
    demoEvacuations.unshift(zone);
    return zone;
  }

  const rows = await rest<RouteOpsSnapshot["evacuations"]>(
    "evacuation_zones",
    { select: "*" },
    {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        fire_id: input.fire_id,
        zone_name: input.zone_name ?? null,
        polygon: input.polygon,
      }),
    },
  );
  return rows[0];
}

function isPointNearFire(
  pointLat: number,
  pointLon: number,
  firePolygon: [number, number][],
  thresholdKm = 5,
) {
  for (const [lon, lat] of firePolygon) {
    if (haversineKm(pointLat, pointLon, lat, lon) < thresholdKm) return true;
  }
  return false;
}

function riskMultiplier(riskLevel: string) {
  if (riskLevel === "critical") return 1;
  if (riskLevel === "high") return 0.8;
  if (riskLevel === "medium") return 0.6;
  return 0.4;
}

function calculateAlternativeRoute(
  station: FireStateSnapshot["firestations"][number],
  fire: FireStateIncident,
) {
  const deltaLat = station.lat - fire.lat;
  const deltaLon = station.lon - fire.lon;
  const angleFromFire = Math.atan2(deltaLon, deltaLat);
  const offsetKm = 1.0;
  const newLat = station.lat + (offsetKm / 111) * Math.cos(angleFromFire);
  const newLon =
    station.lon +
    (offsetKm / (111 * Math.cos((station.lat * Math.PI) / 180))) * Math.sin(angleFromFire);

  return {
    from: [station.lon, station.lat],
    to: [newLon, newLat],
    waypoints: [
      [station.lon, station.lat],
      [newLon, newLat],
    ],
    reason: `Routed away from ${fire.name}`,
  };
}

function calculateEvacuationPolygon(fire: FireStateIncident) {
  return circularPolygon(fire.lat, fire.lon, fire.estimated_radius + 2000, 16);
}

function buildRouteRecommendation(args: {
  station: FireStateSnapshot["firestations"][number];
  fire: FireStateIncident;
  reason: string;
  score: number;
}) {
  return {
    id: `prepared-route-${args.fire.id}-${args.station.id}`,
    station_id: args.station.id,
    station_name: args.station.name,
    fire_id: args.fire.id,
    fire_name: args.fire.name,
    original_route: null,
    new_route: calculateAlternativeRoute(args.station, args.fire),
    reason: args.reason,
    risk_score: args.score,
    created_at: new Date().toISOString(),
  } satisfies RouteOpsSnapshot["routes"][number];
}

function buildEvacuationRecommendation(fire: FireStateIncident) {
  return {
    id: `prepared-evac-${fire.id}`,
    fire_id: fire.id,
    zone_name: `${fire.name} Evacuation Zone`,
    polygon: calculateEvacuationPolygon(fire),
    recommended_at: new Date().toISOString(),
  } satisfies RouteOpsSnapshot["evacuations"][number];
}

export async function analyzeFireAgent(
  fireState: FireStateSnapshot,
): Promise<AgentOpsSnapshot> {
  const findings: AgentOpsSnapshot["findings"] = [];
  const preparedRouteUpdates: RouteOpsSnapshot["routes"] = [];
  const preparedEvacuations: RouteOpsSnapshot["evacuations"] = [];
  const recent = await listRecentRouteUpdates(60 * 60_000);

  for (const fire of fireState.fires) {
    for (const station of fireState.firestations) {
      const distanceKm = haversineKm(station.lat, station.lon, fire.lat, fire.lon);
      const score =
        (Math.max(1, fire.growth_rate) * riskMultiplier(fire.risk_level)) /
        Math.max(distanceKm, 0.5);
      const nearby = isPointNearFire(station.lat, station.lon, fire.polygon_coords, 5);
      if (score <= 0.7 && !nearby) continue;

      const severity = nearby || score >= 1.4 ? "critical" : "high";
      const reason = nearby
        ? `Station ${station.name} is within 5km of ${fire.name}. Immediate rerouting recommended.`
        : `${fire.name} (${fire.risk_level} risk) spreading rapidly toward ${station.name}. Distance: ${distanceKm.toFixed(1)}km`;

      findings.push({
        id: `${fire.id}-${station.id}-route`,
        type: "route_risk",
        severity,
        fireId: fire.id,
        fireName: fire.name,
        stationId: station.id,
        stationName: station.name,
        riskScore: score,
        distanceKm,
        reason,
      });

      const duplicateRoute = recent.routes.some(
        (route) =>
          route.station_id === station.id &&
          (route.reason === reason || route.fire_id === fire.id || route.fire_name === fire.name),
      );
      if (!duplicateRoute) {
        preparedRouteUpdates.push(buildRouteRecommendation({
          station,
          fire,
          reason,
          score,
        }));
      }
    }

    const duplicateZone = recent.evacuations.some((zone) => zone.fire_id === fire.id);
    if ((fire.risk_level === "critical" || fire.risk_level === "high") && !duplicateZone) {
      preparedEvacuations.push(buildEvacuationRecommendation(fire));
      findings.push({
        id: `${fire.id}-evacuation`,
        type: "evacuation_zone",
        severity: fire.risk_level === "critical" ? "critical" : "high",
        fireId: fire.id,
        fireName: fire.name,
        reason: `Evacuation recommended near ${fire.name}.`,
      });
    }
  }

  return {
    status: "complete",
    scannedAt: new Date().toISOString(),
    firesAnalyzed: fireState.fires.length,
    stationsAnalyzed: fireState.firestations.length,
    findings,
    createdRouteUpdates: preparedRouteUpdates,
    createdEvacuations: preparedEvacuations,
  };
}

export async function runAutonomousFireAgent(
  fireState: FireStateSnapshot,
): Promise<AgentOpsSnapshot> {
  const analysis = await analyzeFireAgent(fireState);
  const createdRouteUpdates: RouteOpsSnapshot["routes"] = [];
  const createdEvacuations: RouteOpsSnapshot["evacuations"] = [];

  for (const route of analysis.createdRouteUpdates) {
    const committed = await createRouteUpdate({
      station_id: route.station_id,
      station_name: route.station_name,
      fire_id: route.fire_id,
      fire_name: route.fire_name,
      original_route: route.original_route,
      new_route: route.new_route,
      reason: route.reason,
      risk_score: route.risk_score,
    });
    if (committed) createdRouteUpdates.push(committed);
  }

  for (const zone of analysis.createdEvacuations) {
    const committed = await createEvacuationZone({
      fire_id: zone.fire_id,
      zone_name: zone.zone_name ?? undefined,
      polygon: zone.polygon,
    });
    if (committed) createdEvacuations.push(committed);
  }

  return {
    ...analysis,
    createdRouteUpdates,
    createdEvacuations,
  };
}
