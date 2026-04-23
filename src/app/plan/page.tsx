export default function PlanPlaceholder() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
          Command center
        </p>
        <h1 className="font-display text-3xl font-medium tracking-[-0.02em] text-[var(--color-text-primary)]">
          Coming online in the next commit.
        </h1>
        <p className="mt-3 text-[14px] text-[var(--color-text-secondary)]">
          Phase 4 brings the 3-panel mission-control shell with the live map.
        </p>
      </div>
    </main>
  );
}
