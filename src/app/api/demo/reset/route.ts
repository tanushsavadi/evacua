import { NextResponse } from "next/server";
import { resetAgentMessages } from "@/lib/ops/agent-messages";
import { resetAgentRuns } from "@/lib/ops/evacua-agent-runs";
import {
  buildFireStateFromSupabase,
  getResponderStats,
  listRecentRouteUpdates,
  resetDemoOperationsState,
} from "@/lib/ops/supabase-fire-ops";

export const runtime = "nodejs";

export async function POST() {
  resetDemoOperationsState();
  resetAgentMessages();
  resetAgentRuns();

  const [fireState, responderStats, routeOps] = await Promise.all([
    buildFireStateFromSupabase(),
    getResponderStats(),
    listRecentRouteUpdates(60 * 60_000),
  ]);

  return NextResponse.json({
    success: true,
    scenario: "Pine Ridge judge demo",
    fireState,
    responderStats,
    routeOps,
  });
}
