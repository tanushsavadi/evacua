import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-[color,box-shadow,background-color,border-color] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--color-ember)] text-[#1a0d02]',
        secondary:
          'border-white/[0.08] bg-white/[0.04] text-[var(--color-text-secondary)]',
        destructive:
          'border-transparent bg-[var(--color-red)] text-white',
        outline:
          'text-[var(--color-text-primary)] border-[var(--color-line-subtle)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
