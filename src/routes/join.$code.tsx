import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import {
  AvatarPicker,
  Button,
  Card,
  ColourPicker,
  PageHeader,
  PinReveal,
  Tag,
  TextField,
} from '@/components'
import { previewQuery, useJoinGame, useReclaimPlayer } from '@/features/game/queries'
import { NameForm, normaliseCode } from '@/features/game/schemas'
import { uploadAvatar } from '@/lib/avatars'
import type { AvatarColour } from '@/lib/colours'
import { dataUrlToBlob } from '@/lib/image'
import { loadProfile, saveProfile } from '@/lib/profile'
import { useUserId } from '@/lib/useUserId'
import { errorMessage, GameError } from '@/lib/errors'

export const Route = createFileRoute('/join/$code')({
  beforeLoad: async ({ params, context }) => {
    const code = normaliseCode(params.code)
    if (code !== params.code) throw redirect({ to: '/join/$code', params: { code } })
    const preview = await context.queryClient.fetchQuery(previewQuery(code))
    if (preview?.is_member) throw redirect({ to: '/g/$code', params: { code } })
  },
  component: JoinGame,
})

type Mode = 'join' | 'reclaim'

function JoinGame() {
  const { code } = Route.useParams()
  const navigate = useNavigate()
  const { data: preview } = useQuery(previewQuery(code))
  const join = useJoinGame()
  const reclaim = useReclaimPlayer()

  const [mode, setMode] = useState<Mode>('join')
  const userId = useUserId()
  const [remembered] = useState(loadProfile)
  const [name, setName] = useState(remembered?.name ?? '')
  const [colour, setColour] = useState<AvatarColour>(remembered?.colour ?? 'pink')
  const [photo, setPhoto] = useState<string | null>(remembered?.photo ?? null)
  const [photoNote, setPhotoNote] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [newPin, setNewPin] = useState<string | null>(null)

  const goToGame = () => void navigate({ to: '/g/$code', params: { code } })

  if (preview === null) {
    return (
      <main className="pt-10">
        <Card tone="pink" tilt={-1}>
          <h1 className="text-3xl">No such game</h1>
          <p className="mt-2 font-medium">
            Nothing matches <strong>{code}</strong>. Check the code with your host.
          </p>
          <Link to="/" className="mt-4 inline-flex min-h-11 items-center label-mono underline">
            ← Back to start
          </Link>
        </Card>
      </main>
    )
  }

  if (newPin) return <PinReveal pin={newPin} onDone={goToGame} note={photoNote} />

  const canJoin = preview ? preview.status === 'lobby' || preview.status === 'picking' : true
  const activeMode: Mode = canJoin ? mode : 'reclaim'

  function onJoin(e: FormEvent) {
    e.preventDefault()
    const parsed = NameForm.safeParse({ name, colour })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Check your name')
      return
    }
    join.mutate(
      { code, name: parsed.data.name, colour: parsed.data.colour },
      {
        onSuccess: async (res) => {
          saveProfile({ name: parsed.data.name, colour: parsed.data.colour, photo })
          if (photo && !res.rejoined) {
            try {
              await uploadAvatar(res.game_id, userId, await dataUrlToBlob(photo))
            } catch (err) {
              setPhotoNote(errorMessage(err))
            }
          }
          if (res.pin) setNewPin(res.pin)
          else goToGame()
        },
        onError: (err) => {
          if (err instanceof GameError && err.code === 'name_taken') setMode('reclaim')
        },
      },
    )
  }

  function onReclaim(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setFieldError('Enter the name you joined with')
      return
    }
    reclaim.mutate({ code, name: name.trim(), pin }, { onSuccess: (res) => res.ok && goToGame() })
  }

  const reclaimFailure =
    reclaim.data && !reclaim.data.ok
      ? reclaim.data.error === 'pin_locked'
        ? 'Too many wrong PINs. Try again in 15 minutes.'
        : `That PIN is wrong.${reclaim.data.attempts_left ? ` ${reclaim.data.attempts_left} tries left.` : ''}`
      : null

  return (
    <main className="pt-4">
      <Link to="/" className="mb-4 inline-flex min-h-11 items-center label-mono underline">
        ← Back
      </Link>
      <PageHeader kicker={`Game ${code}`} title={preview?.name ?? 'Join game'}>
        {preview && (
          <div className="flex gap-2">
            <Tag tone="mint">{preview.player_count} in</Tag>
            {!canJoin && <Tag tone="red">Already started</Tag>}
          </div>
        )}
      </PageHeader>

      {activeMode === 'join' ? (
        <form onSubmit={onJoin} className="flex flex-col gap-5" noValidate>
          <TextField
            label="Your name"
            placeholder="Sam"
            autoComplete="nickname"
            maxLength={20}
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setFieldError(null)
            }}
            error={fieldError}
          />
          <ColourPicker value={colour} onChange={setColour} />
          <AvatarPicker name={name} colour={colour} value={photo} onChange={setPhoto} />
          {join.isError && (
            <p role="alert" className="font-bold text-red-ink">
              {errorMessage(join.error)}
            </p>
          )}
          <Button type="submit" size="lg" block loading={join.isPending}>
            Join game
          </Button>
          <button
            type="button"
            className="min-h-11 label-mono underline"
            onClick={() => setMode('reclaim')}
          >
            Lost your phone? Reclaim your seat
          </button>
        </form>
      ) : (
        <form onSubmit={onReclaim} className="flex flex-col gap-5" noValidate>
          <Card tone="yellow" tilt={-1}>
            <h2 className="text-xl">Reclaim your seat</h2>
            <p className="mt-1 font-medium">
              {join.error instanceof GameError && join.error.code === 'name_taken'
                ? 'That name is taken. If it is you, enter the PIN you were shown when you joined.'
                : 'Enter the name you joined with and your 4-digit PIN.'}
            </p>
          </Card>
          <TextField
            label="Your name"
            maxLength={20}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setFieldError(null)
            }}
            error={fieldError}
          />
          <TextField
            label="PIN"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            error={reclaimFailure ?? (reclaim.isError ? errorMessage(reclaim.error) : null)}
          />
          <Button
            type="submit"
            variant="blue"
            size="lg"
            block
            loading={reclaim.isPending}
            disabled={pin.length !== 4}
          >
            Reclaim seat
          </Button>
          {canJoin && (
            <button
              type="button"
              className="min-h-11 label-mono underline"
              onClick={() => {
                setMode('join')
                join.reset()
              }}
            >
              ← Join as someone new
            </button>
          )}
        </form>
      )}
    </main>
  )
}
