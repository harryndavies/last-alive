import { useState } from 'react'
import { useAvatarUrl } from '@/lib/avatars'
import { cn } from '@/lib/cn'
import { COLOUR_HEX, isAvatarColour } from '@/lib/colours'

export interface AvatarProps {
  name: string
  colour: string
  /** Storage path of the player's photo, if they set one. */
  photo?: string | null
  /** A local preview (object or data URL), e.g. while picking a photo. */
  src?: string | null
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

export function Avatar({ name, colour, photo, src, size = 'md', dead, className }: AvatarProps) {
  const { data: signed } = useAvatarUrl(src ? null : photo)
  const [broken, setBroken] = useState(false)
  const bg = isAvatarColour(colour) ? COLOUR_HEX[colour] : COLOUR_HEX.paper
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  const image = !broken ? (src ?? signed) : null

  return (
    <span
      aria-hidden="true"
      data-avatar=""
      style={{ backgroundColor: bg }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full brut font-display text-ink shadow-hard-sm',
        SIZE[size],
        dead && 'grayscale',
        className,
      )}
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initial
      )}
      {dead && (
        <span className="absolute inset-0 flex items-center justify-center bg-paper/40 text-red-ink">
          ✕
        </span>
      )}
    </span>
  )
}
