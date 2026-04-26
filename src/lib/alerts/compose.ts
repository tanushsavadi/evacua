import type { CrisisEvent } from "@/lib/schemas/crisis";
import { z } from "zod";

export type AlertPayload = {
  incident: {
    id: string;
    name: string;
    risk: CrisisEvent["severity"];
    lat: number;
    lon: number;
    impact?: number;
    description: string;
    lastUpdate: string;
    source?: string;
  };
  operations: {
    posture: "watch" | "prepare" | "leave";
    region: string;
    recommendedAction: string;
    routeSummary?: string;
  };
  recipients?: Array<{
    name: string;
    phone?: string;
    email?: string;
  }>;
};

export const AlertPayloadSchema = z.object({
  incident: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    risk: z.enum(["info", "minor", "moderate", "severe", "extreme"]),
    lat: z.number(),
    lon: z.number(),
    impact: z.number().optional(),
    description: z.string(),
    lastUpdate: z.string().min(1),
    source: z.string().optional(),
  }),
  operations: z.object({
    posture: z.enum(["watch", "prepare", "leave"]),
    region: z.string().min(1),
    recommendedAction: z.string().min(1),
    routeSummary: z.string().optional(),
  }),
  recipients: z
    .array(
      z.object({
        name: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().optional(),
      }),
    )
    .optional(),
});

export function buildAlertPayload(args: {
  event: CrisisEvent;
  posture?: "watch" | "prepare" | "leave";
  region?: string;
  routeSummary?: string;
}): AlertPayload {
  const { event } = args;
  return {
    incident: {
      id: event.id,
      name: event.headline,
      risk: event.severity,
      lat: event.centroid.lat,
      lon: event.centroid.lng,
      impact: event.impact,
      description: event.rationale ?? event.body ?? "",
      lastUpdate: event.publishedAt,
      source: event.source,
    },
    operations: {
      posture: args.posture ?? "prepare",
      region: args.region ?? "California operations region",
      recommendedAction:
        event.severity === "extreme" || (event.impact ?? 0) >= 0.75
          ? "Dispatch responders and broadcast evacuation guidance."
          : "Monitor incident, validate route status, and prepare alert copy.",
      routeSummary: args.routeSummary,
    },
  };
}

export function composeEmergencyAlertMessage(payload: AlertPayload): string {
  const impactText =
    payload.incident.impact != null
      ? `${Math.round(payload.incident.impact * 100)}%`
      : "n/a";
  return [
    "EVACUA OPERATIONS ALERT",
    "",
    `Incident: ${payload.incident.name}`,
    `Severity: ${payload.incident.risk.toUpperCase()} · Impact: ${impactText}`,
    `Source: ${(payload.incident.source ?? "unknown").toUpperCase()}`,
    "",
    `Posture: ${payload.operations.posture.toUpperCase()}`,
    `Region: ${payload.operations.region}`,
    `Action: ${payload.operations.recommendedAction}`,
    payload.operations.routeSummary ? `Route: ${payload.operations.routeSummary}` : null,
    "",
    `Updated: ${new Date(payload.incident.lastUpdate).toLocaleString()}`,
  ].filter(Boolean).join("\n");
}
