import { z } from "zod";
import { LatLngSchema } from "./household";

export const CrisisKind = z.enum([
  "fire_perimeter",
  "fire_incident",
  "weather_alert",
  "red_flag",
  "evacuation_order",
  "evacuation_warning",
  "road_closure",
  "power_shutoff",
]);
export type CrisisKind = z.infer<typeof CrisisKind>;

export const CrisisSeverity = z.enum(["info", "minor", "moderate", "severe", "extreme"]);
export type CrisisSeverity = z.infer<typeof CrisisSeverity>;

export const CrisisSource = z.enum([
  "nws",
  "nifc",
  "calfire",
  "caltrans",
  "scenario",
]);
export type CrisisSource = z.infer<typeof CrisisSource>;

/** Minimal polygon: [ [ [lng, lat], ... ] ]. We keep things compact. */
export const RingSchema = z.array(z.tuple([z.number(), z.number()]));
export const PolygonSchema = z.array(RingSchema);
export type Polygon = z.infer<typeof PolygonSchema>;

export const CrisisEventSchema = z.object({
  id: z.string(),
  source: CrisisSource,
  kind: CrisisKind,
  severity: CrisisSeverity,
  headline: z.string(),
  body: z.string().default(""),
  publishedAt: z.string(),            // ISO
  expiresAt: z.string().optional(),   // ISO
  url: z.string().url().optional(),

  /** Best single point we have. Always present for scoring. */
  centroid: LatLngSchema,

  /** Optional explicit polygon (e.g. fire perimeter / alert area). */
  polygon: PolygonSchema.optional(),

  /** Optional linear feature for road closures / routes. */
  line: z.array(z.tuple([z.number(), z.number()])).optional(),

  /** Normalized distance (km) from household. Filled by scorer. */
  distanceKm: z.number().optional(),

  /** Impact score [0..1]. Filled by scorer. */
  impact: z.number().min(0).max(1).optional(),

  /** Human-readable "why this matters" snippet. Filled by scorer. */
  rationale: z.string().optional(),
});
export type CrisisEvent = z.infer<typeof CrisisEventSchema>;
