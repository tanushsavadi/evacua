import { NextResponse } from "next/server";
import { getOpsDataMode } from "@/lib/ops/supabase-fire-ops";

export const runtime = "nodejs";

function present(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

export async function GET() {
  const demoMode =
    process.env.EVACUA_DEMO_MODE === "true" ||
    process.env.NEXT_PUBLIC_EVACUA_DEMO_MODE === "true" ||
    getOpsDataMode() === "demo";
  const mapboxSource = present(process.env.NEXT_PUBLIC_MAPBOX_TOKEN)
    ? "env"
    : demoMode
      ? "calhacks-fallback"
      : "missing";
  const telegramMode = process.env.EVACUA_ALERT_MODE === "live" ? "live" : "dry-run";

  return NextResponse.json({
    status: present(process.env.ANTHROPIC_API_KEY) && present(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY) ? "ready" : "needs-config",
    checks: {
      anthropicKey: present(process.env.ANTHROPIC_API_KEY),
      vapiPublicKey: present(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY),
      vapiAssistantId: present(process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID),
      telegramMode,
      dataMode: getOpsDataMode(),
      mapboxSource,
      demoReset: true,
      typecheckScript: "pnpm typecheck",
      buildScript: "pnpm exec next build --webpack",
    },
  });
}
