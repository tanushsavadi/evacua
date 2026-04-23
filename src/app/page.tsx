export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center">
      <div className="absolute inset-0 evacua-vignette pointer-events-none" />
      <div className="absolute inset-0 evacua-grid pointer-events-none" />
      <div className="relative z-10 mx-auto max-w-2xl px-6 text-center">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
          Evacuation OS
        </p>
        <h1 className="text-balance font-display text-5xl font-medium leading-[1.05] tracking-tight text-[var(--color-text-primary)] md:text-6xl">
          The missing layer between alerts and action.
        </h1>
        <p className="mx-auto mt-6 max-w-lg text-balance text-base leading-relaxed text-[var(--color-text-secondary)]">
          Evacua turns live wildfire, weather, and road signals into a
          household-specific plan — and quietly updates it the moment
          conditions change.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3 text-sm text-[var(--color-text-muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-ember)] animate-ember-pulse" />
          scaffold online · phase 1 complete
        </div>
      </div>
    </main>
  );
}
