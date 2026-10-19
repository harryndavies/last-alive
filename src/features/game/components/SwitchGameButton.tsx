import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { buttonClasses, Sheet } from '@/components'
import { useUserId } from '@/lib/useUserId'
import { myGamesQuery } from '../myGames'
import { YourGamesList } from './YourGames'

/** Opens your other games (and new / join) without leaving this one. */
export function SwitchGameButton({ code }: { code: string }) {
  const [open, setOpen] = useState(false)
  const userId = useUserId()
  const games = useQuery({ ...myGamesQuery(userId), enabled: open })

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 self-center label-mono underline"
      >
        Switch game
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your games">
        <div className="flex flex-col gap-4">
          {games.data ? (
            <YourGamesList games={games.data} currentCode={code} heading={false} />
          ) : (
            <p className="animate-pulse label-mono">Loading…</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Link to="/new" className={buttonClasses('yellow', 'md', true)}>
              New game
            </Link>
            <Link to="/" className={buttonClasses('paper', 'md', true)}>
              Join a game
            </Link>
          </div>
        </div>
      </Sheet>
    </>
  )
}
