import { Avatar, Tag } from '@/components'
import type { Player } from '../schemas'

export interface PlayerListProps {
  players: Player[]
  meId: string
  /** Show the cards-locked state instead of plain "in". */
  showReady?: boolean
  onRemove?: (player: Player) => void
}

export function PlayerList({ players, meId, showReady, onRemove }: PlayerListProps) {
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Players">
      {players.map((p, i) => (
        <li
          key={p.id}
          className={`flex min-h-16 items-center gap-3 rounded-xl brut bg-paper px-3 py-2 shadow-hard-sm ${i % 2 ? 'rotate-[0.4deg]' : '-rotate-[0.4deg]'}`}
        >
          <Avatar name={p.name} colour={p.colour} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-lg font-bold">{p.name}</span>
            <span className="flex gap-1.5">
              {p.is_host && <Tag tone="yellow">Host</Tag>}
              {p.id === meId && <Tag tone="blue">You</Tag>}
            </span>
          </div>
          {showReady ? (
            p.cards_locked ? (
              <Tag tone="mint">Locked ✓</Tag>
            ) : (
              <Tag tone="paper">Picking…</Tag>
            )
          ) : (
            <Tag tone="mint">In</Tag>
          )}
          {onRemove && p.id !== meId && (
            <button
              type="button"
              onClick={() => onRemove(p)}
              aria-label={`Remove ${p.name}`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full brut bg-paper font-display shadow-hard-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
