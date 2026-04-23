import { NextResponse } from "next/server";
import { fetchNwsAlerts } from "@/lib/adapters/nws";
import { fetchNifcPerimeters } from "@/lib/adapters/nifc";
import { SCENARIOS, framesUpTo } from "@/lib/scenarios";
import { scoreAll, deriveCrisisState } from "@/lib/scoring/impact";
import { CrisisEventSchema, type CrisisEvent } from "@/lib/schemas/crisis";

export const runtime = "nodejs";

type Body = {
  lat: number;
  lng: number;
  demo?: string;
  tSec?: number;
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

  const events: CrisisEvent[] = [];
  const sourcesUsed: string[] = [];
  let mode: "live" | "scenario" = "live";

  if (body.demo && SCENARIOS[body.demo]) {
    mode = "scenario";
    const scn = SCENARIOS[body.demo];
    const frame = framesUpTo(scn, body.tSec ?? 9999);
    for (const ev of frame.events) {
      const parsed = CrisisEventSchema.safeParse(ev);
      if (parsed.success) events.push(parsed.data);
    }
    sourcesUsed.push("scenario");
  } else {
    const [nws, nifc] = await Promise.all([
      fetchNwsAlerts(home).catch(() => []),
      fetchNifcPerimeters(home).catch(() => []),
    ]);
    for (const ev of [...nws, ...nifc]) {
      const parsed = CrisisEventSchema.safeParse(ev);
      if (parsed.success) events.push(parsed.data);
    }
    if (nws.length) sourcesUsed.push("nws");
    if (nifc.length) sourcesUsed.push("nifc");
  }

  const scored = scoreAll(events, home).slice(0, 12);
  const state = deriveCrisisState(scored, body.previousState);

  return NextResponse.json({
    mode,
    sourcesUsed,
    state,
    events: scored,
    computedAt: new Date().toISOString(),
  });
}
