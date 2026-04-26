"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-lg font-medium leading-none",
    "transition-[transform,background-color,border-color,color,box-shadow]",
    "duration-200 ease-[var(--ease-premium)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-cyan)]/60",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.985]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-text-primary)] text-[var(--color-bg-oled)] hover:bg-white shadow-[0_14px_32px_-20px_rgba(255,255,255,0.9)]",
        ember:
          "bg-[var(--color-ember)] text-[#1a0d02] hover:brightness-[1.08] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-ember)_45%,transparent),0_24px_48px_-24px_color-mix(in_oklab,var(--color-ember)_60%,transparent)]",
        cyan:
          "bg-[var(--color-cyan)] text-[#031015] hover:brightness-[1.08] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-cyan)_35%,transparent),0_24px_48px_-24px_color-mix(in_oklab,var(--color-cyan)_50%,transparent)]",
        danger:
          "bg-[var(--color-red)] text-white hover:brightness-[1.08] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-red)_38%,transparent),0_24px_48px_-24px_color-mix(in_oklab,var(--color-red)_60%,transparent)]",
        glass:
          "border border-white/[0.08] bg-white/[0.04] text-[var(--color-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-white/[0.14] hover:bg-white/[0.07]",
        ghost:
          "bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.04]",
        outline:
          "bg-transparent text-[var(--color-text-primary)] border border-[var(--color-line-strong)] hover:bg-white/[0.03] hover:border-[var(--color-text-muted)]",
      },
      size: {
        sm: "h-9 px-4 text-[13px]",
        md: "h-11 px-5 text-[14px]",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
