import { NextResponse } from "next/server";
import {
  analyzeFireAgent,
  buildFireStateFromSupabase,
  runAutonomousFireAgent,
} from "@/lib/ops/supabase-fire-ops";

export const runtime = "nodejs";

export async function GET() {
  try {
    const fireState = await buildFireStateFromSupabase();
    return NextResponse.json(await analyzeFireAgent(fireState));
  } catch (error) {
    console.error("Fire agent API error:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze fire agent",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const fireState = await buildFireStateFromSupabase();
    return NextResponse.json(await runAutonomousFireAgent(fireState));
  } catch (error) {
    console.error("Fire agent commit API error:", error);
    return NextResponse.json(
      {
        error: "Failed to commit fire agent recommendations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
