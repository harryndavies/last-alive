import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { buttonClasses, Card } from '@/components'
import { ensureSession } from '@/lib/supabase'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await ensureSession()
    return { userId: session.user.id }
  },
  component: RootLayout,
  notFoundComponent: NotFound,
  errorComponent: RootError,
  pendingComponent: Booting,
})

function RootLayout() {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">
      <Outlet />
    </div>
  )
}

function Booting() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="animate-pulse label-mono">Loading…</p>
    </div>
  )
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      <Card tone="pink" tilt={-1}>
        <h1 className="text-3xl">Nothing here</h1>
        <p className="mt-2">That page has gone into hiding.</p>
        <Link to="/" className={buttonClasses('yellow', 'md', true) + ' mt-4'}>
          Back to start
        </Link>
      </Card>
    </div>
  )
}

function RootError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return (
    <div className="mx-auto max-w-md px-4 pt-16">
      <Card tone="red" tilt={1}>
        <h1 className="text-3xl">Oops</h1>
        <p className="mt-2 font-medium">{message}</p>
        <a href="/" className={buttonClasses('paper', 'md', true) + ' mt-4'}>
          Start again
        </a>
      </Card>
    </div>
  )
}
