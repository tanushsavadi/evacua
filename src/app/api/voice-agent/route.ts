import { NextResponse } from "next/server";
import { handleOperatorRequest } from "@/lib/voice-agent/handler";
import { VoiceAgentRequestSchema } from "@/lib/voice-agent/schemas";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = VoiceAgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid voice-agent request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await handleOperatorRequest(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Voice-agent API error:", error);
    return NextResponse.json(
      {
        error: "Voice-agent request failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
