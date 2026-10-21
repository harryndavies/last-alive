import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { buttonClasses, Button, Sheet, Sprite, Tag, TextField } from '@/components'
import { HowToPlay } from '@/features/game/components/HowToPlay'
import { YourGames } from '@/features/game/components/YourGames'
import { CodeForm, normaliseCode } from '@/features/game/schemas'

export const Route = createFileRoute('/')({
  component: Landing,
})

function Landing() {
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)
  const [rules, setRules] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onJoin(e: FormEvent) {
    e.preventDefault()
    const parsed = CodeForm.safeParse({ code: normaliseCode(code) })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the code')
      return
    }
    void navigate({ to: '/join/$code', params: { code: normaliseCode(parsed.data.code) } })
  }

  return (
    <main className="flex flex-col gap-6 pt-6">
      <div className="flex justify-center gap-2">
        <Tag tone="ink">Top secret</Tag>
        <Tag tone="ink">No sign-up</Tag>
      </div>

      <h1 className="flex flex-col items-center leading-[0.85]">
        <span className="text-[min(5.5rem,26vw)]">Last</span>
        <span className="relative -mt-3 flex items-center gap-3 self-end">
          <Sprite name="duck" className="w-[min(3rem,13vw)]" />
          <span className="inline-block -rotate-3 rounded-2xl brut bg-paper px-4 pt-2 pb-1 text-[min(3.8rem,17vw)] shadow-hard">
            Alive
          </span>
        </span>
      </h1>

      <img
        src="/hero.webp"
        width={842}
        height={505}
        alt="A grinning player hands a rubber duck to an unsuspecting friend, while someone peeks round the door, hunting her."
        className="-mx-2 h-auto w-[calc(100%+1rem)] max-w-none"
      />

      <p className="text-center font-mono text-base leading-snug">
        The real-life assassin game. Get your target to take the right weapon from you, in the right
        place. Don&rsquo;t get got.
      </p>

      <ol className="grid grid-cols-3 gap-2.5">
        {(
          [
            ['1', 'Join with a code', 'bg-pink', '-rotate-2'],
            ['2', 'Get a secret mission', 'bg-mint', ''],
            ['3', 'Be the last alive', 'bg-blue', 'rotate-2'],
          ] as const
        ).map(([n, text, bg, tilt]) => (
          <li
            key={n}
            className={`flex min-h-32 flex-col justify-center rounded-xl brut px-2 py-3 text-center shadow-hard ${bg} ${tilt}`}
          >
            <div className="font-display text-4xl leading-none">{n}</div>
            <div className="mt-1 font-display text-[min(0.875rem,3.8vw)] leading-tight uppercase">
              {text}
            </div>
          </li>
        ))}
      </ol>

      <YourGames />

      <div className="flex flex-col gap-4 pt-2">
        <Link to="/new" className={buttonClasses('yellow', 'lg', true)}>
          New game
        </Link>

        {joining ? (
          <form onSubmit={onJoin} className="flex flex-col gap-3" noValidate>
            <TextField
              label="Game code"
              placeholder="CLUE-7Q"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError(null)
              }}
              error={error}
            />
            <Button type="submit" variant="blue" size="lg" block>
              Join
            </Button>
          </form>
        ) : (
          <Button variant="paper" size="lg" block onClick={() => setJoining(true)}>
            Join with code
          </Button>
        )}
        <button
          type="button"
          onClick={() => setRules(true)}
          className="inline-flex min-h-11 items-center justify-center label-mono underline"
        >
          New here? How to play →
        </button>
        <Sheet open={rules} onClose={() => setRules(false)} title="How to play">
          <HowToPlay heading={false} />
        </Sheet>
      </div>
    </main>
  )
}
