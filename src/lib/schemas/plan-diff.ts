import { z } from "zod";
import { PlanStateSchema, PlanTaskSchema, RouteGeometrySchema } from "./plan";

/**
 * A PlanDiff is the structured story of what changed between two consecutive
 * plans. The Ember Field diff drawer reads from this directly, and the
 * sonner toast lifts its headline from here as well.
 *
 * Diffs are computed client-side so the UI can react immediately without
 * waiting on another round trip. The narrator's tone is deliberate: short,
 * directive, never alarmed without cause.
 */
export const DiffTriggerSchema = z.object({
  id: z.string(),
  headline: z.string(),
  kind: z.string(),
  source: z.string(),
  impact: z.number().min(0).max(1).optional(),
});
export type DiffTrigger = z.infer<typeof DiffTriggerSchema>;

export const PlanDiffSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  prevPlanId: z.string(),
  nextPlanId: z.string(),

  stateChanged: z.boolean(),
  prevState: PlanStateSchema,
  nextState: PlanStateSchema,

  primaryRouteChanged: z.boolean(),
  prevPrimary: RouteGeometrySchema.optional(),
  nextPrimary: RouteGeometrySchema.optional(),

  /** Positive = new plan wants us to leave earlier, negative = later. */
  leaveByDeltaMin: z.number(),
  prevLeaveByIso: z.string().nullable(),
  nextLeaveByIso: z.string().nullable(),

  destinationChanged: z.boolean(),
  prevDestination: z
    .object({ label: z.string(), address: z.string() })
    .optional(),
  nextDestination: z
    .object({ label: z.string(), address: z.string() })
    .optional(),

  addedTasks: z.array(PlanTaskSchema),
  removedTasks: z.array(PlanTaskSchema),
  elevatedTasks: z.array(PlanTaskSchema),

  /** Top events that plausibly caused this re-plan (by impact). */
  triggers: z.array(DiffTriggerSchema),

  /** Intensity of this diff — drives ember/red accenting. */
  severity: z.enum(["calm", "notable", "urgent"]),

  /** One-line, directive. Used by toast + drawer header. */
  headline: z.string(),
  /** Up to ~3 sentences. Explains why the plan moved. */
  narrative: z.string(),

  author: z.enum(["opus", "fallback"]),
});
export type PlanDiff = z.infer<typeof PlanDiffSchema>;
