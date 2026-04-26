"use client";

import Link from "next/link";
import { Wordmark } from "./wordmark";

export function TopNav() {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-7 md:px-10">
        <Wordmark />
        <nav className="flex items-center gap-1 text-[13px] text-[var(--color-text-secondary)]">
          <Link
            href="/plan"
            className="rounded-full px-3 py-1.5 transition-colors hover:text-[var(--color-text-primary)] hover:bg-white/[0.04]"
          >
            Command center
          </Link>
          <Link
            href="#how-it-works"
            className="rounded-full px-3 py-1.5 transition-colors hover:text-[var(--color-text-primary)] hover:bg-white/[0.04]"
          >
            Workflow
          </Link>
          <Link
            href="#sources"
            className="rounded-full px-3 py-1.5 transition-colors hover:text-[var(--color-text-primary)] hover:bg-white/[0.04]"
          >
            Sources
          </Link>
          <Link
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full px-3 py-1.5 transition-colors hover:text-[var(--color-text-primary)] hover:bg-white/[0.04]"
          >
            GitHub
          </Link>
        </nav>
      </div>
    </header>
  );
}
