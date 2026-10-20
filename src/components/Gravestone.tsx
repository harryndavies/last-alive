import { cn } from '@/lib/cn'

// The small stone takes its width from the caller (an icon next to a name, a badge on a photo).
const SIZE = { sm: '', md: 'w-44', lg: 'w-60' } as const

/**
 * The 8-bit gravestone. The stone is a 58x56 sprite scaled up with hard edges;
 * the name and epitaph are real text in a pixel font, sized to the stone.
 */
export function Gravestone({
  name,
  epitaph,
  size = 'lg',
  className,
}: {
  name?: string
  epitaph?: string
  size?: keyof typeof SIZE
  className?: string
}) {
  const text = size !== 'sm' && (name || epitaph)
  return (
    <div
      // Only the text overlay needs `relative`; leaving it off lets callers position the stone.
      className={cn('@container shrink-0', text && 'relative', SIZE[size], className)}
      role={text ? 'img' : undefined}
      aria-label={text ? `Gravestone: ${name ?? ''}. ${epitaph ?? ''}` : undefined}
      aria-hidden={text ? undefined : true}
    >
      <img
        src="/gravestone.png"
        alt=""
        width={58}
        height={56}
        className="block h-auto w-full [image-rendering:pixelated]"
      />
      {text && (
        <div
          aria-hidden="true"
          className="absolute inset-x-[20%] top-[20%] bottom-[22%] flex flex-col items-center justify-center gap-[4cqw] text-center font-['Press_Start_2P'] leading-snug text-[#2b2b2b]"
        >
          <span className="text-[6cqw]">R.I.P.</span>
          {name && <span className="text-[7.5cqw] break-words">{name}</span>}
          {epitaph && <span className="text-[4.5cqw] break-words">{epitaph}</span>}
        </div>
      )}
    </div>
  )
}
