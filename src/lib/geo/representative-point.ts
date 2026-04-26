import type { CrisisEvent } from "@/lib/schemas/crisis";
import type { LatLng } from "@/lib/geo/types";

/**
 * Best point on the map / radar for a crisis feature: prefer the midpoint of a
 * closure line, else the ring centroid of a polygon, else the declared
 * centroid. Keeps markers aligned with drawn geometry (avoids offshore dots
 * when the hand-tuned centroid is lazy).
 */
export function representativePoint(ev: CrisisEvent): LatLng {
  if (ev.line && ev.line.length >= 2) {
    const i = Math.floor(ev.line.length / 2);
    const [lng, lat] = ev.line[i]!;
    return { lat, lng };
  }
  const outer = ev.polygon?.[0];
  if (outer && outer.length >= 3) {
    let slng = 0;
    let slat = 0;
    let n = 0;
    for (const pair of outer) {
      const [lng, lat] = pair;
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        slng += lng;
        slat += lat;
        n++;
      }
    }
    if (n > 0) return { lat: slat / n, lng: slng / n };
  }
  return { ...ev.centroid };
}
