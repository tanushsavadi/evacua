import { Wordmark } from "./wordmark";

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-[var(--color-line-subtle)]/60 bg-[var(--color-bg-oled)]">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center md:px-10">
        <div className="flex flex-col gap-2">
          <Wordmark subtle />
          <p className="max-w-sm text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            Evacua is a research-stage open-source project. It complements -
            does not replace - guidance from local emergency services.
          </p>
        </div>
        <div className="flex items-center gap-6 font-mono text-[11px] uppercase text-[var(--color-text-muted)]">
          <span>v0.1 - MIT</span>
          <span aria-hidden className="h-3 w-px bg-[var(--color-line-subtle)]" />
          <span>Made for California responders</span>
        </div>
      </div>
    </footer>
  );
}
