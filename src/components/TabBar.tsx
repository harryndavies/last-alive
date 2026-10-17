import { Link } from '@tanstack/react-router'

export interface TabBarProps {
  code: string
}

const TABS = [
  { to: '/g/$code', label: 'Home', icon: '⌂', exact: true },
  { to: '/g/$code/mission', label: 'Mission', icon: '◎', exact: false },
  { to: '/g/$code/board', label: 'Board', icon: '☰', exact: false },
] as const

export function TabBar({ code }: TabBarProps) {
  return (
    <nav
      aria-label="Game"
      className="fixed inset-x-0 bottom-0 z-20 border-t-3 border-ink bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {TABS.map((tab) => (
          <li key={tab.to} className="border-ink not-last:border-r-3">
            <Link
              to={tab.to}
              params={{ code }}
              activeOptions={{ exact: tab.exact }}
              className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-ink data-[status=active]:bg-yellow"
            >
              <span aria-hidden="true" className="font-display text-2xl leading-none">
                {tab.icon}
              </span>
              <span className="label-mono">{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
