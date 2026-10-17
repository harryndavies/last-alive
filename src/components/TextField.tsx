import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string | null
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="label-mono">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hint ? hintId : null, error ? errorId : null) || undefined}
        className={cn(
          'min-h-12 rounded-xl brut bg-paper px-4 text-lg font-medium text-ink shadow-hard-sm placeholder:text-muted/70',
          'focus:shadow-hard focus:outline-none',
          error && 'border-red-ink',
        )}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-bold text-red-ink">
          {error}
        </p>
      )}
    </div>
  )
})
