import { cn } from "@/lib/utils";

export function Wordmark({
  className,
  subtle = false,
}: {
  className?: string;
  subtle?: boolean;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <EmberMark />
      <span
        className={cn(
          "font-display text-[15px] font-medium tracking-[-0.01em]",
          subtle ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-primary)]",
        )}
      >
        Evacua
      </span>
    </div>
  );
}

function EmberMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <radialGradient id="ember-core" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#FFC48A" />
          <stop offset="55%" stopColor="#FF9E3D" />
          <stop offset="100%" stopColor="#9A4E10" />
        </radialGradient>
      </defs>
      <circle cx="9" cy="9" r="7.5" fill="url(#ember-core)" />
      <circle
        cx="9"
        cy="9"
        r="7.5"
        fill="none"
        stroke="#FF9E3D"
        strokeOpacity="0.25"
        strokeWidth="1"
      />
      <circle cx="9" cy="9" r="2.3" fill="#1a0d02" fillOpacity="0.55" />
    </svg>
  );
}
