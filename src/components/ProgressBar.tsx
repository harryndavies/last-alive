export interface ProgressBarProps {
  value: number
  max: number
  label: string
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="label-mono">{label}</span>
        <span className="font-display text-lg">
          {value} / {max}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-6 overflow-hidden rounded-full brut bg-paper"
      >
        <div
          className="h-full bg-mint transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
