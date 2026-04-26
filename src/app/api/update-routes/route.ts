import { NextResponse } from "next/server";
import { enqueueAgentMessage } from "@/lib/ops/agent-messages";
import {
  createEvacuationZone,
  createRouteUpdate,
  listRecentRouteUpdates,
} from "@/lib/ops/supabase-fire-ops";

export const runtime = "nodejs";

type RouteUpdateBody = {
  station_id?: number;
  station_name?: string;
  fire_id?: string;
  fire_name?: string;
  new_route?: unknown;
  original_route?: unknown;
  reason?: string;
  risk_score?: number | null;
};

type EvacuationBody = {
  fire_id?: string;
  zone_name?: string;
  polygon?: unknown;
};

export async function GET() {
  try {
    return NextResponse.json(await listRecentRouteUpdates());
  } catch (error) {
    console.error("Error fetching route updates:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch routes",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  let body: RouteUpdateBody;
  try {
    body = (await req.json()) as RouteUpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Number.isFinite(body.station_id) || !body.new_route) {
    return NextResponse.json(
      { error: "Missing required fields: station_id and new_route are required" },
      { status: 400 },
    );
  }

  try {
    const route_update = await createRouteUpdate({
      station_id: Number(body.station_id),
      new_route: body.new_route,
      original_route: body.original_route,
      reason: body.reason,
      risk_score: body.risk_score ?? null,
    });

    enqueueAgentMessage({
      action: "route_update",
      message: route_update.reason,
      data: route_update,
    });

    return NextResponse.json({
      success: true,
      route_update,
      message: "Route update saved successfully",
    });
  } catch (error) {
    console.error("Error creating route update:", error);
    return NextResponse.json(
      {
        error: "Failed to save route update",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  let body: EvacuationBody;
  try {
    body = (await req.json()) as EvacuationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.fire_id || !body.polygon) {
    return NextResponse.json(
      { error: "Missing required fields: fire_id and polygon are required" },
      { status: 400 },
    );
  }

  try {
    const evacuation_zone = await createEvacuationZone({
      fire_id: body.fire_id,
      zone_name: body.zone_name,
      polygon: body.polygon,
    });

    enqueueAgentMessage({
      action: "evacuation",
      message: `Evacuation zone created for ${body.zone_name ?? body.fire_id}.`,
      data: evacuation_zone,
    });

    return NextResponse.json({
      success: true,
      evacuation_zone,
      message: "Evacuation zone created successfully",
    });
  } catch (error) {
    console.error("Error creating evacuation zone:", error);
    return NextResponse.json(
      {
        error: "Failed to save evacuation zone",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
