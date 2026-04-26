import type { CrisisEvent } from "@/lib/schemas/crisis";

/**
 * NIFC — Current Interagency Fire Perimeters (public, no auth).
 * We fetch a bounding-box slice around the operations center so the payload
 * stays small.
 */
export async function fetchNifcPerimeters(opts: {
  lat: number;
  lng: number;
  radiusKm?: number;
}): Promise<CrisisEvent[]> {
  const radius = opts.radiusKm ?? 80;
  // Degrees-ish bbox — good enough for a filter
  const dLat = radius / 111;
  const dLng = radius / (111 * Math.cos((opts.lat * Math.PI) / 180));
  const xmin = opts.lng - dLng;
  const xmax = opts.lng + dLng;
  const ymin = opts.lat - dLat;
  const ymax = opts.lat + dLat;

  const url =
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/" +
    "WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query" +
    `?where=1%3D1&outFields=poly_IncidentName,attr_IncidentSize,attr_PercentContained,attr_FireDiscoveryDateTime` +
    `&geometry=${xmin},${ymin},${xmax},${ymax}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects&f=geojson`;

  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        properties: {
          poly_IncidentName?: string;
          attr_IncidentSize?: number;
          attr_PercentContained?: number;
          attr_FireDiscoveryDateTime?: number | string;
        };
        geometry?: { type: string; coordinates: unknown } | null;
      }>;
    };
    const out: CrisisEvent[] = [];
    for (const f of data.features ?? []) {
      const p = f.properties ?? {};
      const centroid = centroidFromGeometry(f.geometry);
      if (!centroid) continue;
      const name = p.poly_IncidentName ?? "Unnamed fire";
      const acres = p.attr_IncidentSize ?? 0;
      const pct = p.attr_PercentContained ?? 0;
      const discovered =
        typeof p.attr_FireDiscoveryDateTime === "number"
          ? new Date(p.attr_FireDiscoveryDateTime).toISOString()
          : typeof p.attr_FireDiscoveryDateTime === "string"
            ? p.attr_FireDiscoveryDateTime
            : new Date().toISOString();

      out.push({
        id: `nifc:${name}:${centroid.lat.toFixed(2)},${centroid.lng.toFixed(2)}`,
        source: "nifc",
        kind: "fire_perimeter",
        severity:
          acres > 5000 ? "extreme" : acres > 1000 ? "severe" : acres > 100 ? "moderate" : "minor",
        headline: `${name} — ${Math.round(acres).toLocaleString()} acres`,
        body: `${Math.round(pct)}% contained. Perimeter current per WFIGS.`,
        publishedAt: discovered,
        url: "https://services3.arcgis.com",
        centroid,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function centroidFromGeometry(
  geom?: { type: string; coordinates: unknown } | null,
): { lat: number; lng: number } | null {
  if (!geom) return null;
  const pts: number[][] = [];
  const visit = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    if (arr.length >= 2 && typeof arr[0] === "number" && typeof arr[1] === "number") {
      pts.push([arr[0] as number, arr[1] as number]);
      return;
    }
    for (const child of arr) visit(child);
  };
  visit(geom.coordinates);
  if (pts.length === 0) return null;
  const lng = pts.reduce((a, [x]) => a + x, 0) / pts.length;
  const lat = pts.reduce((a, [, y]) => a + y, 0) / pts.length;
  return { lat, lng };
}
