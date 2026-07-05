import { NextResponse } from "next/server";
import {
  composeEmergencyAlertMessage,
  AlertPayloadSchema,
  type AlertPayload,
} from "@/lib/alerts/compose";
import {
  approvalErrorResponse,
  markApprovedActionExecuted,
  validateLiveActionApproval,
} from "@/lib/voice-agent/approval";

export const runtime = "nodejs";

type Body = {
  payload?: AlertPayload;
  incident?: {
    id?: string;
    name?: string | null;
    risk?: "low" | "medium" | "high" | "critical" | null;
    lat?: number | null;
    lon?: number | null;
    containment?: number | null;
    last_update?: string;
    description?: string | null;
  };
  customMessage?: string;
  pendingActionId?: string;
  approvalToken?: string;
};

type ChannelResult = {
  channel: "telegram" | "sms_webhook" | "email_webhook" | "fallback";
  ok: boolean;
  detail: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload =
    body.payload ??
    (body.incident
      ? {
          incident: {
            id: body.incident.id ?? "",
            name: body.incident.name ?? "Unnamed Fire",
            risk: mapIncidentRisk(body.incident.risk),
            lat: Number(body.incident.lat),
            lon: Number(body.incident.lon),
            description: body.incident.description ?? "",
            lastUpdate: body.incident.last_update ?? new Date().toISOString(),
            source: "calfire",
          },
          operations: {
            posture: body.incident.risk === "critical" ? "leave" : "prepare",
            region: "California operations region",
            recommendedAction:
              "Dispatch responders, validate evacuation buffers, and broadcast official guidance.",
          },
        }
      : null);

  if (!payload) {
    return NextResponse.json({ error: "Missing payload or incident" }, { status: 400 });
  }

  const parsedPayload = AlertPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsedPayload.error.issues },
      { status: 400 },
    );
  }

  const base = composeEmergencyAlertMessage(parsedPayload.data);
  const message = body.customMessage
    ? `${base}\n\nOperator note: ${body.customMessage}`
    : base;

  const approval = await validateLiveActionApproval(body, ["alert"]);
  if (!approval.ok) return approvalErrorResponse(approval.error);

  if (process.env.EVACUA_ALERT_MODE !== "live") {
    return NextResponse.json({
      success: true,
      dryRun: true,
      approvalMode: approval.mode,
      channel: "dry_run",
      channels: [
        {
          channel: "fallback",
          ok: true,
          detail: "Prepared only. Set EVACUA_ALERT_MODE=live to send through configured channels.",
        },
      ],
      message: "Prepared alert draft. No public alert was sent.",
      composedText: message,
    });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const smsWebhook = process.env.SMS_WEBHOOK_URL;
  const emailWebhook = process.env.EMAIL_WEBHOOK_URL;

  const channelResults: ChannelResult[] = [];

  if (token && chatId) {
    try {
      const telegramRes = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            disable_web_page_preview: true,
          }),
        },
      );
      const telegramJson = (await telegramRes.json()) as {
        ok?: boolean;
        description?: string;
      };
      channelResults.push({
        channel: "telegram",
        ok: Boolean(telegramRes.ok && telegramJson.ok),
        detail: telegramJson.description ?? (telegramRes.ok ? "sent" : "send failed"),
      });
    } catch {
      channelResults.push({
        channel: "telegram",
        ok: false,
        detail: "Failed to reach Telegram.",
      });
    }
  }

  if (smsWebhook) {
    try {
      const smsRes = await fetch(smsWebhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          incidentId: parsedPayload.data.incident.id,
          recipients: parsedPayload.data.recipients ?? [],
        }),
      });
      channelResults.push({
        channel: "sms_webhook",
        ok: smsRes.ok,
        detail: smsRes.ok ? "sent" : `sms webhook ${smsRes.status}`,
      });
    } catch {
      channelResults.push({
        channel: "sms_webhook",
        ok: false,
        detail: "Failed to reach SMS webhook.",
      });
    }
  }

  if (emailWebhook) {
    try {
      const emailRes = await fetch(emailWebhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: `Evacua Alert: ${parsedPayload.data.incident.name}`,
          body: message,
          incidentId: parsedPayload.data.incident.id,
          recipients: parsedPayload.data.recipients ?? [],
        }),
      });
      channelResults.push({
        channel: "email_webhook",
        ok: emailRes.ok,
        detail: emailRes.ok ? "sent" : `email webhook ${emailRes.status}`,
      });
    } catch {
      channelResults.push({
        channel: "email_webhook",
        ok: false,
        detail: "Failed to reach email webhook.",
      });
    }
  }

  if (channelResults.length === 0) {
    return NextResponse.json({
      success: false,
      channel: "fallback",
      channels: [{ channel: "fallback", ok: false, detail: "No dispatch channels configured." }],
      message:
        "No channels configured. Alert text generated; copy/send manually.",
      composedText: message,
    });
  }

  const success = channelResults.some((c) => c.ok);

  if (success) await markApprovedActionExecuted(body.pendingActionId);

  return NextResponse.json(
    {
      success,
      approvalMode: approval.mode,
      channel: success ? channelResults.find((c) => c.ok)?.channel : "fallback",
      channels: channelResults,
      messageSid: success ? "sent" : undefined,
      message: success
        ? "Alert dispatched to one or more channels."
        : "All configured channels failed. Fallback text prepared.",
      composedText: message,
    },
    { status: success ? 200 : 502 },
  );
}

function mapIncidentRisk(risk: "low" | "medium" | "high" | "critical" | null | undefined) {
  if (risk === "critical") return "extreme";
  if (risk === "high") return "severe";
  if (risk === "medium") return "moderate";
  return "minor";
}
