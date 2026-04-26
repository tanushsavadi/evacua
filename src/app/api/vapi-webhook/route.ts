import { NextResponse } from "next/server";
import {
  enqueueAgentMessage,
  listAgentMessages,
  type AgentMessage,
} from "@/lib/ops/agent-messages";

export const runtime = "nodejs";

type Body = {
  action?: AgentMessage["action"];
  message?: string;
  data?: unknown;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.action || !body.message) {
    return NextResponse.json(
      { error: "Missing required fields: action and message are required" },
      { status: 400 },
    );
  }

  const item = enqueueAgentMessage({
    action: body.action,
    message: body.message,
    data: body.data,
  });

  return NextResponse.json({
    success: true,
    message: "Agent message received",
    item,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const messages = listAgentMessages(searchParams.get("since"));
  return NextResponse.json({
    messages,
    count: messages.length,
    latest_timestamp:
      messages.length > 0 ? messages[messages.length - 1]?.timestamp : null,
  });
}
