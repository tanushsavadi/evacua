import { NextResponse } from "next/server";
import { generatePlan } from "@/lib/agents/plan-agent";
import { HouseholdSchema } from "@/lib/schemas/household";
import { CrisisEventSchema } from "@/lib/schemas/crisis";
import { PlanStateSchema } from "@/lib/schemas/plan";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = body as {
    household?: unknown;
    events?: unknown;
    state?: unknown;
  };
  const householdParsed = HouseholdSchema.safeParse(payload.household);
  if (!householdParsed.success) {
    return NextResponse.json(
      { error: "Invalid household", issues: householdParsed.error.issues },
      { status: 400 },
    );
  }
  const events = Array.isArray(payload.events)
    ? payload.events
        .map((e) => CrisisEventSchema.safeParse(e))
        .filter((r): r is { success: true; data: import("zod").infer<typeof CrisisEventSchema> } => r.success)
        .map((r) => r.data)
    : [];
  const stateParsed = PlanStateSchema.safeParse(payload.state);
  const state = stateParsed.success ? stateParsed.data : "watch";

  try {
    const plan = await generatePlan({
      household: householdParsed.data,
      events,
      state,
    });
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "planner failure" },
      { status: 500 },
    );
  }
}
