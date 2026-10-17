import { cn } from '@/lib/cn'
import { useKillPhotoUrl } from './photos'

export interface KillPhotoProps {
  path: string | null | undefined
  alt: string
  className?: string
  /** Rendered when there is no photo (or it cannot be loaded). */
  fallback?: React.ReactNode
  /** Load straight away (alerts, kill cam) instead of when scrolled into view (feed). */
  eager?: boolean
}

export function KillPhoto({ path, alt, className, fallback = null, eager }: KillPhotoProps) {
  const { data: url, isPending, isError } = useKillPhotoUrl(path)
  if (!path || isError) return <>{fallback}</>
  if (isPending || !url) {
    return <div aria-hidden="true" className={cn('animate-pulse brut bg-paper', className)} />
  }
  return (
    <img
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('brut object-cover', className)}
    />
  )
}
