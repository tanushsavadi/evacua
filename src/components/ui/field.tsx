"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({
  children,
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-muted)]",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-xl border bg-[var(--color-bg-panel)] px-4 text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-[border-color,box-shadow,background-color] duration-200 ease-[var(--ease-premium)]",
          invalid
            ? "border-[var(--color-red)]/70 focus-visible:border-[var(--color-red)] focus-visible:ring-2 focus-visible:ring-[var(--color-red)]/30"
            : "border-[var(--color-line-subtle)] hover:border-[var(--color-line-strong)] focus-visible:border-[var(--color-cyan)] focus-visible:ring-2 focus-visible:ring-[var(--color-cyan)]/20",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[88px] w-full rounded-xl border bg-[var(--color-bg-panel)] px-4 py-3 text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none transition-[border-color,box-shadow] duration-200 ease-[var(--ease-premium)]",
        invalid
          ? "border-[var(--color-red)]/70 focus-visible:border-[var(--color-red)] focus-visible:ring-2 focus-visible:ring-[var(--color-red)]/30"
          : "border-[var(--color-line-subtle)] hover:border-[var(--color-line-strong)] focus-visible:border-[var(--color-cyan)] focus-visible:ring-2 focus-visible:ring-[var(--color-cyan)]/20",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-[12px] text-[var(--color-red)]/90">{message}</p>
  );
}

export function SegmentedGroup<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "grid gap-2",
        options.length <= 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-xl border px-3 py-3 text-left transition-colors duration-200",
              active
                ? "border-[var(--color-ember)]/70 bg-[var(--color-ember-soft)]/60 text-[var(--color-text-primary)]"
                : "border-[var(--color-line-subtle)] bg-[var(--color-bg-panel)] text-[var(--color-text-secondary)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-text-primary)]",
            )}
          >
            <div className="text-[13px] font-medium tracking-[-0.005em]">
              {o.label}
            </div>
            {o.hint && (
              <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                {o.hint}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
