/** Dashboard-facing incident shape shared by the incident feed, map focus,
 * and alert/dispatch flows. Mirrors the fields served by /api/fire-state. */
export interface FireIncident {
  id: string;
  name: string | null;
  risk: "low" | "medium" | "high" | "critical" | null;
  lat: number | null;
  lon: number | null;
  containment: number | null;
  last_update: string;
  description?: string | null;
}
