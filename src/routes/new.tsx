import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { AvatarPicker, Button, ColourPicker, PageHeader, PinReveal, TextField } from '@/components'
import { DeadlineField } from '@/features/game/components/Deadline'
import { useCreateGame } from '@/features/game/queries'
import { NameForm } from '@/features/game/schemas'
import { uploadAvatar } from '@/lib/avatars'
import type { AvatarColour } from '@/lib/colours'
import { fromLocalInput } from '@/lib/deadline'
import { dataUrlToBlob } from '@/lib/image'
import { rpc } from '@/lib/rpc'
import { loadProfile, saveProfile } from '@/lib/profile'
import { useUserId } from '@/lib/useUserId'
import { errorMessage } from '@/lib/errors'

export const Route = createFileRoute('/new')({
  component: NewGame,
})

function NewGame() {
  const navigate = useNavigate()
  const create = useCreateGame()
  const [gameName, setGameName] = useState('')
  const userId = useUserId()
  const [remembered] = useState(loadProfile)
  const [name, setName] = useState(remembered?.name ?? '')
  const [colour, setColour] = useState<AvatarColour>(remembered?.colour ?? 'yellow')
  const [photo, setPhoto] = useState<string | null>(remembered?.photo ?? null)
  const [photoNote, setPhotoNote] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ code: string; pin: string } | null>(null)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = NameForm.safeParse({ name, colour })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Check your name')
      return
    }
    create.mutate(
      { gameName: gameName.trim(), name: parsed.data.name, colour: parsed.data.colour },
      {
        onSuccess: async (res) => {
          saveProfile({ name: parsed.data.name, colour: parsed.data.colour, photo })
          const end = fromLocalInput(endsAt)
          if (end) {
            try {
              await rpc('set_game_end', { p_game_id: res.game_id, p_ends_at: end })
            } catch (err) {
              setPhotoNote(`End time not set: ${errorMessage(err)} You can set it in the lobby.`)
            }
          }
          if (photo) {
            try {
              await uploadAvatar(res.game_id, userId, await dataUrlToBlob(photo))
            } catch (err) {
              setPhotoNote(errorMessage(err))
            }
          }
          setCreated({ code: res.code, pin: res.pin })
        },
      },
    )
  }

  if (created) {
    return (
      <PinReveal
        pin={created.pin}
        note={photoNote}
        onDone={() => void navigate({ to: '/g/$code/lobby', params: { code: created.code } })}
      />
    )
  }

  return (
    <main className="pt-4">
      <Link to="/" className="mb-4 inline-flex min-h-11 items-center label-mono underline">
        ← Back
      </Link>
      <PageHeader kicker="You're the host" title="New game" />
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <TextField
          label="Game name (optional)"
          placeholder="Office Assassins"
          maxLength={40}
          value={gameName}
          onChange={(e) => setGameName(e.target.value)}
        />
        <TextField
          label="Your name"
          placeholder="Sam"
          autoComplete="nickname"
          maxLength={20}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setFieldError(null)
          }}
          error={fieldError}
        />
        <ColourPicker value={colour} onChange={setColour} />
        <AvatarPicker name={name} colour={colour} value={photo} onChange={setPhoto} />
        <DeadlineField value={endsAt} onChange={setEndsAt} />
        {create.isError && (
          <p role="alert" className="font-bold text-red-ink">
            {errorMessage(create.error)}
          </p>
        )}
        <Button type="submit" size="lg" block loading={create.isPending}>
          Create game
        </Button>
      </form>
    </main>
  )
}
