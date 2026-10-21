import { useLayoutEffect, useRef, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A heading that shrinks to fit: it starts at `max` px and steps down until
 * its longest word fits the width it has (never below `min`). On most phones
 * nothing changes; on small ones a long name shrinks instead of breaking
 * mid-word or running off the screen. Only a word too long even at `min` wraps.
 */
export function FitText({
  as: Tag = 'span',
  max,
  min = 18,
  className,
  children,
}: {
  as?: ElementType
  max: number
  min?: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      let size = max
      el.style.fontSize = `${size}px`
      while (size > min && el.scrollWidth > el.clientWidth + 1) {
        size -= 2
        el.style.fontSize = `${size}px`
      }
      // Still too long at the smallest size: let it wrap rather than spill out.
      el.style.overflowWrap = el.scrollWidth > el.clientWidth + 1 ? 'anywhere' : ''
    }
    fit()
    // Refit when the space changes (rotation, resize) and once fonts load.
    const ro = new ResizeObserver(fit)
    if (el.parentElement) ro.observe(el.parentElement)
    void document.fonts?.ready.then(fit)
    return () => ro.disconnect()
  }, [max, min, children])

  return (
    <Tag ref={ref} className={cn('max-w-full', className)} style={{ fontSize: max }}>
      {children}
    </Tag>
  )
}
