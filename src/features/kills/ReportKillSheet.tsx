import { useState, type FormEvent } from 'react'
import { Avatar, Button, Sheet } from '@/components'
import type { Player } from '@/features/game/schemas'
import type { Mission } from '@/features/missions/queries'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { useReportKill } from './queries'

export interface ReportKillSheetProps {
  open: boolean
  onClose: () => void
  gameId: string
  mission: Mission
  target: Player
}

function Tick({
  checked,
  onChange,
  label,
  value,
  tone,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  value: string
  tone: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-16 cursor-pointer items-center gap-3 rounded-xl brut p-3 shadow-hard-sm transition-transform',
        checked ? tone : 'bg-paper',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-6 shrink-0 accent-ink"
      />
      <span className="min-w-0 flex-1">
        <span className="block label-mono">{label}</span>
        <span className="font-display text-lg leading-tight uppercase">{value}</span>
      </span>
    </label>
  )
}

export function ReportKillSheet({ open, onClose, gameId, mission, target }: ReportKillSheetProps) {
  const report = useReportKill(gameId)
  const [weapon, setWeapon] = useState(false)
  const [place, setPlace] = useState(false)
  const [phrase, setPhrase] = useState(false)
  const [note, setNote] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!weapon || !place || !phrase) return
    report.mutate(
      { victimId: target.id, note },
      {
        onSuccess: () => {
          onClose()
          setWeapon(false)
          setPlace(false)
          setPhrase(false)
          setNote('')
        },
      },
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="Report a kill">
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="mb-1 flex items-center gap-3">
          <Avatar name={target.name} colour={target.colour} />
          <p className="font-bold">
            You got <span className="font-display text-xl uppercase">{target.name}</span>?
          </p>
        </div>
        <Tick
          checked={weapon}
          onChange={setWeapon}
          label="Weapon"
          value={mission.weapon.text}
          tone="bg-red"
        />
        <Tick
          checked={place}
          onChange={setPlace}
          label="Place"
          value={mission.place.text}
          tone="bg-blue"
        />
        <Tick
          checked={phrase}
          onChange={setPhrase}
          label="Said the phrase"
          value={`“${mission.phrase.text}”`}
          tone="bg-mint"
        />
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Behind the fridge door. Never saw it coming."
            className="rounded-xl brut bg-paper px-3 py-2 font-medium shadow-hard-sm focus:outline-none"
          />
        </label>
        {report.isError && (
          <p role="alert" className="font-bold text-red-ink">
            {errorMessage(report.error)}
          </p>
        )}
        <Button
          type="submit"
          variant="red"
          size="lg"
          block
          disabled={!weapon || !place || !phrase}
          loading={report.isPending}
        >
          Confirm the kill
        </Button>
        <p className="text-center label-mono text-muted">
          {weapon && place && phrase
            ? `${target.name} has 12h to answer`
            : 'Tick all three to confirm'}
        </p>
      </form>
    </Sheet>
  )
}
