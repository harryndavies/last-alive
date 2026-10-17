import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'yellow' | 'red' | 'blue' | 'mint' | 'pink' | 'paper' | 'ink'
export type ButtonSize = 'md' | 'lg' | 'sm'

const VARIANT: Record<ButtonVariant, string> = {
  yellow: 'bg-yellow text-ink',
  red: 'bg-red text-ink',
  blue: 'bg-blue text-ink',
  mint: 'bg-mint text-ink',
  pink: 'bg-pink text-ink',
  paper: 'bg-paper text-ink',
  ink: 'bg-ink text-paper',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-12 px-5 text-base',
  lg: 'min-h-16 px-6 text-xl',
}

/** Shared look so links can render as buttons too. */
export function buttonClasses(
  variant: ButtonVariant = 'yellow',
  size: ButtonSize = 'md',
  block = false,
): string {
  return cn(
    'brut inline-flex select-none items-center justify-center gap-2 rounded-xl font-display uppercase tracking-tight shadow-hard transition-[transform,box-shadow] duration-75',
    'active:translate-x-[5px] active:translate-y-[5px] active:shadow-none',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-0 disabled:active:shadow-hard',
    VARIANT[variant],
    SIZE[size],
    block && 'w-full',
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, block), className)}
      {...rest}
    >
      {loading ? <span className="label-mono">Working…</span> : children}
    </button>
  )
})
