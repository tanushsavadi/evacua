"use client";

import { useMemo, useState } from "react";
import { Send, Copy, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import {
  buildAlertPayload,
  composeEmergencyAlertMessage,
} from "@/lib/alerts/compose";

export function AlertDispatchPanel({
  event,
  posture = "prepare",
  region = "California operations region",
  routeSummary,
}: {
  event: CrisisEvent;
  posture?: "watch" | "prepare" | "leave";
  region?: string;
  routeSummary?: string;
}) {
  const [sending, setSending] = useState(false);
  const [dispatchAndSend, setDispatchAndSend] = useState(false);
  const [lastMode, setLastMode] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<
    Array<{ id: string; at: number; summary: string; acknowledged: boolean }>
  >([]);

  const payload = useMemo(
    () => buildAlertPayload({ event, posture, region, routeSummary }),
    [event, posture, region, routeSummary],
  );
  const preview = useMemo(() => composeEmergencyAlertMessage(payload), [payload]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preview);
      toast("Alert text copied", {
        id: "evacua-alert",
        description: "Paste into command channels or operator comms threads.",
      });
    } catch {
      toast("Copy failed", {
        id: "evacua-alert",
        description: "Select and copy alert text manually.",
      });
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/send-emergency-alert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const data = (await res.json()) as {
        success: boolean;
        channel: string;
        channels?: Array<{ channel: string; ok: boolean; detail: string }>;
        message: string;
        composedText: string;
      };
      setLastMode(data.channel);
      toast(data.success ? "Alert sent" : "Alert prepared", {
        id: "evacua-alert",
        description: data.channels?.length
          ? `${data.message} (${data.channels
              .map((c) => `${c.channel}:${c.ok ? "ok" : "fail"}`)
              .join(", ")})`
          : data.message,
      });
      if (!data.success && data.composedText) {
        await navigator.clipboard.writeText(data.composedText).catch(() => {});
      }
      setAuditLog((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          at: Date.now(),
          summary: data.channels?.length
            ? data.channels.map((c) => `${c.channel}:${c.ok ? "ok" : "fail"}`).join(", ")
            : data.message,
          acknowledged: false,
        },
      ]);
    } catch {
      toast("Alert failed", {
        id: "evacua-alert",
        description: "Could not dispatch alert. Copied fallback text.",
      });
      await navigator.clipboard.writeText(preview).catch(() => {});
    } finally {
      setSending(false);
    }
  };

  const sendWithDispatch = async () => {
    setDispatchAndSend(true);
    try {
      const dispatchRes = await fetch("/api/dispatch-responder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          incidentId: event.id,
          incidentLat: event.centroid.lat,
          incidentLon: event.centroid.lng,
        }),
      });
      const dispatchJson = (await dispatchRes.json()) as { success?: boolean; error?: string };
      if (!dispatchRes.ok || !dispatchJson.success) {
        toast("Dispatch failed", {
          id: "evacua-dispatch",
          description: dispatchJson.error ?? "No available teams for this incident.",
        });
      } else {
        toast("Responder dispatched", {
          id: "evacua-dispatch",
          description: "Team assignment created before alert broadcast.",
        });
      }
      await send();
    } finally {
      setDispatchAndSend(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/25 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10.5px] uppercase text-[var(--color-text-muted)]">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
          Alert dispatch
        </div>
        {lastMode && (
          <span className="text-[10.5px] text-[var(--color-text-muted)]">
            via {lastMode}
          </span>
        )}
      </div>
      <div className="line-clamp-4 whitespace-pre-wrap rounded-lg border border-white/[0.07] bg-black/25 p-2 font-mono text-[10.5px] leading-relaxed text-[var(--color-text-secondary)]">
        {preview}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={sendWithDispatch}
          disabled={dispatchAndSend || sending}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-cyan)]/35 bg-[var(--color-cyan-soft)]/15 px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-cyan)] disabled:opacity-60"
        >
          {dispatchAndSend ? (
            <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" strokeWidth={1.75} />
          ) : (
            <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          Dispatch + alert
        </button>
        <button
          type="button"
          onClick={send}
          disabled={sending || dispatchAndSend}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-ember)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--color-bg-oled)] disabled:opacity-60"
        >
          {sending ? (
            <CheckCircle2 className="h-3.5 w-3.5 animate-pulse" strokeWidth={1.75} />
          ) : (
            <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
          )}
          {sending ? "Sending..." : "Send alert"}
        </button>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line-subtle)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
          Copy text
        </button>
      </div>
      <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-white/[0.07] bg-black/25 p-2">
        {auditLog.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-muted)]">No comms events yet.</p>
        ) : (
          auditLog
            .slice()
            .reverse()
            .map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--color-text-secondary)]">
                  {new Date(row.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {row.summary}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setAuditLog((prev) =>
                      prev.map((r) =>
                        r.id === row.id ? { ...r, acknowledged: !r.acknowledged } : r,
                      ),
                    )
                  }
                  className="rounded-md border border-white/[0.08] px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-text-muted)]"
                >
                  {row.acknowledged ? "Acked" : "Ack"}
                </button>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
