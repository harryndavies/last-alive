import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { safeStorage } from '@/lib/storage'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * A full-screen celebration (or commiseration) that plays once per `id`, then
 * fades away by itself. Tapping skips it. Skipped for reduced motion, since it
 * is usually decoration; `essential` ones still show, just without the fade.
 */
export function Moment({
  id,
  duration = 1800,
  essential = false,
  className,
  children,
}: {
  id: string
  duration?: number
  /** Carries information players need, so it shows even with reduce motion on. */
  essential?: boolean
  className?: string
  children: ReactNode
}) {
  const key = `moment:${id}`
  const [still] = useState(prefersReducedMotion)
  const [show, setShow] = useState(() => (essential || !still) && safeStorage.get(key) !== '1')

  // Only mark it seen once it has played out, so a re-render mid-way doesn't eat it.
  useEffect(() => {
    if (!show) return
    const t = window.setTimeout(() => {
      safeStorage.set(key, '1')
      setShow(false)
    }, duration)
    return () => window.clearTimeout(t)
  }, [show, key, duration])

  if (!show) return null
  // Portalled to <body>: tilted cards are transformed, which would trap a fixed overlay.
  return createPortal(
    <div
      aria-hidden="true"
      onClick={() => {
        safeStorage.set(key, '1')
        setShow(false)
      }}
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-4',
        !still && 'animate-[moment-fade_var(--moment-ms)_ease-in_both]',
        className,
      )}
      style={{ ['--moment-ms' as string]: `${duration}ms` }}
    >
      {children}
    </div>,
    document.body,
  )
}

/** Pixel confetti falling from the top of the screen. */
export function PixelConfetti({ count = 48 }: { count?: number }) {
  const [bits] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 600,
      duration: 1400 + Math.random() * 1200,
      size: 6 + Math.round(Math.random() * 2) * 4,
      spin: Math.random() > 0.5 ? 1 : -1,
      colour: ['#ffd23f', '#ff4b3e', '#4b7bff', '#5ee6a8', '#ff8fd0', '#111111'][i % 6],
    })),
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute -top-4 block animate-[confetti-fall_var(--d)_linear_both]"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            background: b.colour,
            animationDelay: `${b.delay}ms`,
            ['--d' as string]: `${b.duration}ms`,
            ['--spin' as string]: `${b.spin * 360}deg`,
          }}
        />
      ))}
    </div>
  )
}
