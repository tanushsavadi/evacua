import { NextResponse } from "next/server";
import { enqueueAgentMessage } from "@/lib/ops/agent-messages";
import {
  dispatchResponder,
  getResponderStats,
} from "@/lib/ops/supabase-fire-ops";

export const runtime = "nodejs";

type DispatchBody = {
  incidentId?: string;
  incidentLat?: number;
  incidentLon?: number;
};

export async function POST(req: Request) {
  let body: DispatchBody;
  try {
    body = (await req.json()) as DispatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    !body.incidentId ||
    !Number.isFinite(body.incidentLat) ||
    !Number.isFinite(body.incidentLon)
  ) {
    return NextResponse.json(
      { error: "Missing required fields: incidentId, incidentLat, incidentLon" },
      { status: 400 },
    );
  }

  try {
    const result = await dispatchResponder({
      incidentId: body.incidentId,
      incidentLat: Number(body.incidentLat),
      incidentLon: Number(body.incidentLon),
    });

    if (!result) {
      return NextResponse.json(
        { error: "No available responders found", message: "All teams are currently dispatched." },
        { status: 404 },
      );
    }

    enqueueAgentMessage({
      action: "dispatch",
      message: `Team ${result.responder.team_number} dispatched from ${result.responder.firestation_name}.`,
      data: result,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Dispatch responder error:", error);
    return NextResponse.json(
      {
        error: "Failed to dispatch responder",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const stats = await getResponderStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Get responder stats error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch responder stats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
