import { NextResponse } from "next/server";
import { deriveCrisisState, scoreAll } from "@/lib/scoring/impact";
import {
  buildFireStateFromSupabase,
  fireStateToEvents,
} from "@/lib/ops/supabase-fire-ops";

export const runtime = "nodejs";

type Body = {
  lat: number;
  lng: number;
  previousState?: "watch" | "prepare" | "leave";
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const home = { lat: body.lat, lng: body.lng };
  if (
    typeof home.lat !== "number" ||
    typeof home.lng !== "number" ||
    Math.abs(home.lat) > 90 ||
    Math.abs(home.lng) > 180
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  try {
    const fireState = await buildFireStateFromSupabase();
    const events = scoreAll(fireStateToEvents(fireState), home).slice(0, 25);
    const state = deriveCrisisState(events, body.previousState);

    return NextResponse.json({
      mode: "live",
      sourcesUsed: ["supabase", "calfire"],
      state,
      events,
      computedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Signals API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch operations signals",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
