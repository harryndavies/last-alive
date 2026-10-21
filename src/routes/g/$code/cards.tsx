import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Button, Card, PageHeader, ProgressBar, Sprite, TextField } from '@/components'
import { CARD_SPRITE } from '@/features/cards/cardSprites'
import { PlayingCard } from '@/features/cards/PlayingCard'
import { CardsForm, myCardsQuery, useSubmitCards } from '@/features/cards/queries'
import { CARD_COPY, CARD_KINDS, SUGGESTIONS, type CardKind } from '@/features/cards/suggestions'
import { ChangePhotoSheet } from '@/features/game/components/ChangePhotoSheet'
import { DeadlineEditor } from '@/features/game/components/Deadline'
import { LeaveButton } from '@/features/game/components/LeaveButton'
import { SwitchGameButton } from '@/features/game/components/SwitchGameButton'
import { QrSheet } from '@/features/game/components/QrSheet'
import { gameKeys } from '@/features/game/keys'
import { PlayerList } from '@/features/game/components/PlayerList'
import { PrizeVote } from '@/features/game/components/Prize'
import { useGameContext, useStartGame } from '@/features/game/queries'
import { errorMessage } from '@/lib/errors'
import { useUserId } from '@/lib/useUserId'
import { useCopy, useTheme } from '@/lib/theme'

export const Route = createFileRoute('/g/$code/cards')({
  component: PickCards,
})

const TILTS = [-1, 1, -2] as const

function PickCards() {
  const copy = useCopy()
  const { code } = Route.useParams()
  const userId = useUserId()
  const { game, players, me } = useGameContext(code, userId)
  const qc = useQueryClient()
  const [photoOpen, setPhotoOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const locked = players.filter((p) => p.cards_locked).length
  const allLocked = locked === players.length && players.length >= 4
  const startGame = useStartGame(game.id)

  return (
    <main className="flex flex-col gap-6 pt-4">
      <PageHeader kicker="Step 2 of 2" title={copy.cardsTitle}>
        <p className="font-medium">
          Your cards go into a shared deck and end up on someone else&rsquo;s mission. Never your
          own.
        </p>
      </PageHeader>

      <ProgressBar value={locked} max={players.length} label="Locked in" />
      <DeadlineEditor game={game} me={me} />

      {me.cards_locked ? (
        <LockedCards gameId={game.id} playerId={me.id} />
      ) : (
        <CardsFormView gameId={game.id} />
      )}

      <PrizeVote game={game} me={me} players={players} />

      {me.is_host ? (
        <div className="flex flex-col gap-2">
          {startGame.isError && (
            <p role="alert" className="font-bold text-red-ink">
              {errorMessage(startGame.error)}
            </p>
          )}
          <Button
            size="lg"
            variant="red"
            block
            disabled={!allLocked}
            loading={startGame.isPending}
            onClick={() => startGame.mutate(undefined)}
          >
            Start the game
          </Button>
          {!allLocked && (
            <p className="text-center label-mono">
              {players.length < 4
                ? 'Need at least 4 players'
                : `Waiting for ${players.length - locked} to lock in`}
            </p>
          )}
        </div>
      ) : (
        me.cards_locked && (
          <Card tone="pink" tilt={1}>
            <p className="font-bold">
              {allLocked
                ? 'Everyone is in. Waiting for the host to start…'
                : 'Waiting for the others…'}
            </p>
          </Card>
        )
      )}

      <section aria-labelledby="ready-heading" className="flex flex-col gap-3">
        <h2 id="ready-heading" className="text-2xl">
          Who&rsquo;s ready
        </h2>
        <PlayerList players={players} meId={me.id} showReady onEditMe={() => setPhotoOpen(true)} />
        <button
          type="button"
          className="min-h-11 self-center label-mono underline"
          onClick={() => setQrOpen(true)}
        >
          Someone missing? Show the QR code
        </button>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-x-6">
        <SwitchGameButton code={game.code} />
        <LeaveButton gameId={game.id} active={false} />
      </div>
      <QrSheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        code={game.code}
        gameName={game.name}
      />
      {photoOpen && (
        <ChangePhotoSheet
          open
          onClose={() => setPhotoOpen(false)}
          me={me}
          userId={userId}
          onSaved={() => void qc.invalidateQueries({ queryKey: gameKeys.players(game.id) })}
        />
      )}
    </main>
  )
}

function LockedCards({ gameId, playerId }: { gameId: string; playerId: string }) {
  const { data: cards = [] } = useQuery(myCardsQuery(gameId, playerId))
  return (
    <section aria-label="Your cards" className="flex flex-col gap-3">
      <p className="label-mono">Your cards are locked in ✓</p>
      <div className="grid gap-3">
        {CARD_KINDS.map((kind, i) => {
          const card = cards.find((c) => c.kind === kind)
          return card ? (
            <PlayingCard key={kind} kind={kind} text={card.text} tilt={TILTS[i]} />
          ) : null
        })}
      </div>
    </section>
  )
}

function CardsFormView({ gameId }: { gameId: string }) {
  const copy = useCopy()
  const theme = useTheme()
  const submit = useSubmitCards(gameId)
  const [values, setValues] = useState<Record<CardKind, string>>({
    weapon: '',
    place: '',
    phrase: '',
  })
  const [errors, setErrors] = useState<Partial<Record<CardKind, string>>>({})

  function set(kind: CardKind, value: string) {
    setValues((v) => ({ ...v, [kind]: value }))
    setErrors((e) => ({ ...e, [kind]: undefined }))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = CardsForm.safeParse(values)
    if (!parsed.success) {
      const next: Partial<Record<CardKind, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'weapon' || key === 'place' || key === 'phrase') next[key] = issue.message
      }
      setErrors(next)
      return
    }
    submit.mutate(parsed.data)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      {CARD_KINDS.map((kind) => (
        <div key={kind} className="relative flex flex-col gap-2">
          {theme !== 'spy' && (
            <Sprite name={CARD_SPRITE[kind].name} className="absolute top-0 right-1 h-5 w-auto" />
          )}
          <TextField
            label={theme === 'spy' ? copy[kind] : CARD_COPY[kind].label}
            placeholder={CARD_COPY[kind].placeholder}
            hint={CARD_COPY[kind].hint}
            maxLength={CARD_COPY[kind].maxLength}
            value={values[kind]}
            onChange={(e) => set(kind, e.target.value)}
            error={errors[kind]}
          />
          <ul
            className="flex flex-wrap gap-2"
            aria-label={`${theme === 'spy' ? copy[kind] : CARD_COPY[kind].label} ideas`}
          >
            {SUGGESTIONS[kind].map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => set(kind, s)}
                  aria-pressed={values[kind] === s}
                  className="min-h-11 rounded-full border-2 border-ink bg-paper px-3 text-sm font-bold shadow-hard-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none aria-pressed:bg-yellow"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {submit.isError && (
        <p role="alert" className="font-bold text-red-ink">
          {errorMessage(submit.error)}
        </p>
      )}
      <Button type="submit" size="lg" variant="yellow" block loading={submit.isPending}>
        Lock in my cards
      </Button>
      <p className="-mt-3 text-center label-mono">You can&rsquo;t change them after this</p>
    </form>
  )
}
