import { POST as commanderPost } from "@/app/api/opus-commander/route";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const response = await commanderPost(req);
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (payload && typeof payload === "object") {
    delete payload.model;
  }

  return NextResponse.json(payload, { status: response.status });
}
