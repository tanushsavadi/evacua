import { NextResponse } from "next/server";
import { deriveCrisisState } from "@/lib/scoring/impact";
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
    const events = fireStateToEvents(fireState)
      .map((event) => ({
        ...event,
        distanceKm: haversineKm(home.lat, home.lng, event.centroid.lat, event.centroid.lng),
      }))
      .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))
      .slice(0, 25);
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
