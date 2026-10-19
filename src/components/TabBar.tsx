import { Link } from '@tanstack/react-router'
import { useCopy } from '@/lib/theme'

export interface TabBarProps {
  code: string
  /** Dead players have no mission, so the tab is hidden. */
  spectator?: boolean
}

const TABS = [
  { to: '/g/$code', key: 'tabHome', icon: '⌂', exact: true },
  { to: '/g/$code/mission', key: 'tabMission', icon: '◎', exact: false },
  { to: '/g/$code/board', key: 'tabBoard', icon: '☰', exact: false },
] as const

export function TabBar({ code, spectator }: TabBarProps) {
  const copy = useCopy()
  const tabs = spectator ? TABS.filter((t) => t.key !== 'tabMission') : TABS
  return (
    <nav
      aria-label="Game"
      className="fixed inset-x-0 bottom-0 z-20 border-t-3 border-ink bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <ul className={`mx-auto grid max-w-md ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {tabs.map((tab) => (
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
              <span className="label-mono">{copy[tab.key]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
