import { z } from "zod";
import { LatLngSchema } from "./household";

export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const PlanTaskSchema = z.object({
  id: z.string(),
  /** Role or member id this task is for ("all" is ok) */
  assignedTo: z.string(),
  text: z.string().min(3),
  priority: TaskPrioritySchema.default("medium"),
  reason: z.string().optional(),
});
export type PlanTask = z.infer<typeof PlanTaskSchema>;

export const RouteGeometrySchema = z.object({
  id: z.string(),
  label: z.string(),
  summary: z.string(),
  distanceKm: z.number(),
  durationMin: z.number(),
  via: z.string().optional(),
  coordinates: z.array(z.tuple([z.number(), z.number()])),
});
export type RouteGeometry = z.infer<typeof RouteGeometrySchema>;

export const PlanStateSchema = z.enum(["watch", "prepare", "leave"]);
export type PlanState = z.infer<typeof PlanStateSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  generatedAt: z.string(),
  state: PlanStateSchema,

  /** ISO — null when conditions are quiet. */
  leaveByIso: z.string().nullable(),

  destination: z.object({
    label: z.string(),
    address: z.string(),
    coords: LatLngSchema,
  }),

  primaryRouteId: z.string(),
  backupRouteId: z.string().optional(),
  routes: z.array(RouteGeometrySchema),

  tasks: z.array(PlanTaskSchema),

  /** One short sentence for the top of the panel. */
  headline: z.string(),
  /** A sentence or two explaining posture. */
  reasoning: z.string(),
  /** Keys like "nws", "nifc" that contributed. */
  citations: z.array(z.string()),

  /** 0..1 — planner confidence in the current posture. */
  confidence: z.number().min(0).max(1),

  /** Set to "opus" or "fallback" so the UI can be honest. */
  author: z.enum(["opus", "fallback"]),
});
export type Plan = z.infer<typeof PlanSchema>;
