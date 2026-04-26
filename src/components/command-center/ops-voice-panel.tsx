"use client";

import { Activity, Mic, MicOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useVapi } from "@/hooks/use-vapi";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import { cn } from "@/lib/utils";

export function OpsVoicePanel({ focusedEvent }: { focusedEvent?: CrisisEvent | null }) {
  const { isSessionActive, isSpeaking, messages, volumeLevel, start, stop } = useVapi();

  const handleToggle = () => {
    if (isSessionActive) stop();
    else start();
  };

  const vapiConfigMissing = !process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

  return (
    <section className="rounded-lg border border-white/[0.07] bg-black/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase text-[var(--color-text-muted)]">
          <Mic className="h-3 w-3" strokeWidth={1.75} />
          {focusedEvent ? "Focused voice" : "Evacua voice"}
        </div>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[10px] uppercase",
            vapiConfigMissing
              ? "border-[var(--color-amber)]/30 text-[var(--color-amber)]"
              : isSessionActive
                ? "border-[var(--color-cyan)]/35 text-[var(--color-cyan)]"
                : "border-white/[0.08] text-[var(--color-text-muted)]",
          )}
        >
          {vapiConfigMissing ? "Config" : isSessionActive ? "Live" : "Idle"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          onClick={handleToggle}
          size="icon"
          variant={isSessionActive ? "ember" : "glass"}
          className="h-14 w-14 rounded-lg"
          aria-label={isSessionActive ? "Stop voice session" : "Start voice session"}
        >
          {isSessionActive ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-[var(--color-cyan)]" strokeWidth={1.75} />
              Signal gain
            </span>
            <span>{isSpeaking ? "speaking" : isSessionActive ? "listening" : "standby"}</span>
          </div>
          <Progress
            value={Math.min(volumeLevel * 100, 100)}
            className="h-2"
            indicatorClassName={isSessionActive ? "bg-[var(--color-cyan)]" : "bg-white/20"}
          />
        </div>
      </div>

      <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 && !isSessionActive ? (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
            Voice channel standby.
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.timestamp}-${index}`}
              className={cn(
                "rounded-lg border px-3 py-2",
                message.role === "assistant"
                  ? "border-[var(--color-cyan)]/20 bg-[var(--color-cyan-soft)]/10"
                  : "border-white/[0.07] bg-black/25",
              )}
            >
              <div className="mb-1 flex items-center gap-2">
                {message.role === "assistant" ? (
                  <Volume2 className="h-3.5 w-3.5 text-[var(--color-cyan)]" strokeWidth={1.75} />
                ) : (
                  <Mic className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} />
                )}
                <span className="font-mono text-[10px] uppercase text-[var(--color-text-muted)]">
                  {message.timestamp}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {message.content}
              </p>
            </div>
          ))
        )}

        {isSpeaking && (
          <div className="rounded-lg border border-[var(--color-cyan)]/20 bg-[var(--color-cyan-soft)]/10 px-3 py-2">
            <div className="flex items-center gap-2 text-[12px] text-[var(--color-cyan)]">
              <Volume2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Voice response active
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
