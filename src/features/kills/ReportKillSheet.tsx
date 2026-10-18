import { useState, type FormEvent } from 'react'
import { Avatar, Button, Sheet } from '@/components'
import type { Player } from '@/features/game/schemas'
import type { Mission } from '@/features/missions/queries'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { uploadKillPhoto } from './photos'
import { PhotoPicker } from './PhotoPicker'
import { useReportKill } from './queries'

export interface ReportKillSheetProps {
  userId: string
  open: boolean
  onClose: () => void
  gameId: string
  mission: Mission
  target: Player
  /** In sudden death you may claim any living player (`others`). */
  suddenDeath?: boolean
  others?: Player[]
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

export function ReportKillSheet({
  userId,
  open,
  onClose,
  gameId,
  mission,
  target,
  suddenDeath = false,
  others = [],
}: ReportKillSheetProps) {
  const report = useReportKill(gameId)
  const [photo, setPhoto] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [weapon, setWeapon] = useState(false)
  const [place, setPlace] = useState(false)
  const [phrase, setPhrase] = useState(false)
  const [note, setNote] = useState('')
  const [victimId, setVictimId] = useState(target.id)
  const victim = [target, ...others].find((p) => p.id === victimId) ?? target
  // Off-mission (sudden-death) kills need no weapon, place or phrase.
  const offMission = suddenDeath && victim.id !== target.id
  const ready = offMission || (weapon && place && phrase)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    let photoPath: string | undefined
    if (photo) {
      setUploading(true)
      setUploadError(null)
      try {
        photoPath = await uploadKillPhoto(gameId, userId, photo)
      } catch (err) {
        setUploadError(errorMessage(err))
        return
      } finally {
        setUploading(false)
      }
    }
    report.mutate(
      { victimId: victim.id, note, photoPath },
      {
        onSuccess: () => {
          onClose()
          setWeapon(false)
          setPlace(false)
          setPhrase(false)
          setNote('')
          setPhoto(null)
          setVictimId(target.id)
        },
      },
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="Report a kill">
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {suddenDeath && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 label-mono">⚡ Sudden death: who did you get?</legend>
            <div className="flex flex-wrap gap-2">
              {[target, ...others].map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-ink py-1 pr-3 pl-1 font-bold shadow-hard-sm',
                    victimId === p.id ? 'bg-yellow' : 'bg-paper',
                  )}
                >
                  <input
                    type="radio"
                    name="victim"
                    className="sr-only"
                    checked={victimId === p.id}
                    onChange={() => setVictimId(p.id)}
                  />
                  <Avatar name={p.name} colour={p.colour} photo={p.avatar_path} size="sm" />
                  {p.name}
                  {p.id === target.id && <span className="label-mono">(target)</span>}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="mb-1 flex items-center gap-3">
          <Avatar name={victim.name} colour={victim.colour} photo={victim.avatar_path} />
          <p className="font-bold">
            You got <span className="font-display text-xl uppercase">{victim.name}</span>?
          </p>
        </div>
        {offMission ? (
          <p className="rounded-xl brut bg-red p-3 font-bold shadow-hard-sm">
            Sudden death: any weapon, any place, no phrase needed.
          </p>
        ) : (
          <>
            <Tick
              checked={weapon}
              onChange={setWeapon}
              label="They took the weapon"
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
          </>
        )}
        <PhotoPicker file={photo} onChange={setPhoto} disabled={uploading || report.isPending} />
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
        {uploadError && (
          <p role="alert" className="font-bold text-red-ink">
            {uploadError}
          </p>
        )}
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
          disabled={!ready}
          loading={uploading || report.isPending}
        >
          Confirm the kill
        </Button>
        <p className="text-center label-mono text-muted">
          {ready ? `${victim.name} has 12h to answer` : 'Tick all three to confirm'}
        </p>
      </form>
    </Sheet>
  )
}
