import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Button, ColourPicker, PageHeader, PinReveal, TextField } from '@/components'
import { useCreateGame } from '@/features/game/queries'
import { NameForm } from '@/features/game/schemas'
import type { AvatarColour } from '@/lib/colours'
import { errorMessage } from '@/lib/errors'

export const Route = createFileRoute('/new')({
  component: NewGame,
})

function NewGame() {
  const navigate = useNavigate()
  const create = useCreateGame()
  const [gameName, setGameName] = useState('')
  const [name, setName] = useState('')
  const [colour, setColour] = useState<AvatarColour>('yellow')
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
      { onSuccess: (res) => setCreated({ code: res.code, pin: res.pin }) },
    )
  }

  if (created) {
    return (
      <PinReveal
        pin={created.pin}
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
