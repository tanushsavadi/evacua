import { NextResponse } from "next/server";
import { buildFireStateFromSupabase } from "@/lib/ops/supabase-fire-ops";

export const runtime = "nodejs";

export async function GET() {
  try {
    const fireState = await buildFireStateFromSupabase();
    if (process.env.EVACUA_DEBUG_API === "true") {
      console.log("[API] Returning fire state. Fires:", fireState.fires.length);
    }
    return NextResponse.json(fireState);
  } catch (error) {
    console.error("[API] Fire state error:", error);
    if (error instanceof Error) {
      console.error("[API] Stack:", error.stack);
    }
    return NextResponse.json(
      {
        error: "Failed to fetch fire state",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
