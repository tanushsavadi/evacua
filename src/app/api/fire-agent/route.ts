import { NextResponse } from "next/server";
import {
  buildFireStateFromSupabase,
  runAutonomousFireAgent,
} from "@/lib/ops/supabase-fire-ops";

export const runtime = "nodejs";

export async function GET() {
  try {
    const fireState = await buildFireStateFromSupabase();
    return NextResponse.json(await runAutonomousFireAgent(fireState));
  } catch (error) {
    console.error("Fire agent API error:", error);
    return NextResponse.json(
      {
        error: "Failed to run fire agent",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
