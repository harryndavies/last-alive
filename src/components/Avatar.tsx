import { cn } from '@/lib/cn'
import { COLOUR_HEX, isAvatarColour } from '@/lib/colours'

export interface AvatarProps {
  name: string
  colour: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  dead?: boolean
  className?: string
}

const SIZE = {
  sm: 'size-9 text-sm',
  md: 'size-12 text-lg',
  lg: 'size-16 text-2xl',
  xl: 'size-24 text-4xl',
} as const

export function Avatar({ name, colour, size = 'md', dead, className }: AvatarProps) {
  const bg = isAvatarColour(colour) ? COLOUR_HEX[colour] : COLOUR_HEX.paper
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: bg }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full brut font-display text-ink shadow-hard-sm',
        SIZE[size],
        dead && 'grayscale',
        className,
      )}
    >
      {initial}
      {dead && (
        <span className="absolute inset-0 flex items-center justify-center text-red-ink">✕</span>
      )}
    </span>
  )
}
