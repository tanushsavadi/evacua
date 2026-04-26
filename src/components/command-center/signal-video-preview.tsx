"use client";

import { useMemo, useState } from "react";
import { ExternalLink, PlayCircle, VideoOff } from "lucide-react";
import type { CrisisEvent } from "@/lib/schemas/crisis";
import { getSignalVideo } from "@/lib/video/signal-preview";

export function SignalVideoPreview({ event }: { event: CrisisEvent }) {
  const media = useMemo(() => getSignalVideo(event), [event]);
  const [failed, setFailed] = useState(false);

  if (!media || failed) {
    return (
      <div className="mt-3 rounded-lg border border-white/[0.07] bg-black/25 p-3">
        <div className="flex items-center gap-2 text-[11px] uppercase text-[var(--color-text-muted)]">
          <VideoOff className="h-3.5 w-3.5" strokeWidth={1.75} />
          Live video unavailable
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
          No camera feed is mapped for this signal yet. Use official links for
          incident photos and updates.
        </p>
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-[var(--color-cyan)] underline-offset-4 hover:underline"
          >
            Open source update
            <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.07] bg-black/25">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-2.5 py-2">
        <div className="flex items-center gap-1.5 text-[10.5px] uppercase text-[var(--color-text-muted)]">
          <PlayCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
          Visual context
        </div>
        {media.attribution && (
          <span className="text-[10.5px] text-[var(--color-text-muted)]">
            {media.attribution}
          </span>
        )}
      </div>

      {media.type === "mp4" ? (
        <video
          key={media.url}
          className="block h-[168px] w-full object-cover"
          src={media.url}
          autoPlay
          muted
          loop
          playsInline
          controls
          onError={() => setFailed(true)}
        />
      ) : (
        <iframe
          title={media.title}
          src={media.url}
          className="h-[168px] w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onError={() => setFailed(true)}
        />
      )}

      <div className="px-2.5 py-2 text-[11.5px] text-[var(--color-text-secondary)]">
        {media.title}
      </div>
    </div>
  );
}
