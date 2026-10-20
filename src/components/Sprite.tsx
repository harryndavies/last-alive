import { cn } from '@/lib/cn'

/** The 8-bit sprites in /public, drawn with hard pixel edges at any size. */
export const SPRITES = {
  duck: { src: '/duck.png', width: 30, height: 28 },
  qblock: { src: '/qblock.png', width: 30, height: 28 },
  trophy: { src: '/trophy.png', width: 34, height: 27 },
  gravestone: { src: '/gravestone.png', width: 58, height: 56 },
  envelope: { src: '/envelope.png', width: 48, height: 28 },
  eyes: { src: '/eyes.png', width: 62, height: 32 },
  bubble: { src: '/bubble.png', width: 56, height: 30 },
  pin: { src: '/pin.png', width: 18, height: 24 },
  hand: { src: '/hand.png', width: 57, height: 22 },
} as const

export function Sprite({
  name,
  className,
  alt = '',
}: {
  name: keyof typeof SPRITES
  className?: string
  alt?: string
}) {
  const s = SPRITES[name]
  return (
    <img
      src={s.src}
      width={s.width}
      height={s.height}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={cn('block h-auto [image-rendering:pixelated]', className)}
    />
  )
}
