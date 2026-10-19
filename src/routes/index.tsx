import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { buttonClasses, Button, Card, Tag, TextField } from '@/components'
import { YourGames } from '@/features/game/components/YourGames'
import { CodeForm, normaliseCode } from '@/features/game/schemas'

export const Route = createFileRoute('/')({
  component: Landing,
})

function Landing() {
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)
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
      <div className="flex items-center gap-2">
        <Tag tone="red" tilt>
          Top secret
        </Tag>
        <Tag tone="mint">No sign-up</Tag>
      </div>

      <h1 className="text-[3.6rem] leading-[0.9]">
        Last
        <br />
        <span className="inline-block -rotate-2 brut bg-yellow px-2 shadow-hard">Alive</span>
      </h1>

      <Card tone="paper" tilt={1}>
        <p className="text-lg font-medium">
          The real-life assassin game. Get your target to take the right weapon from you, in the
          right place. Don&rsquo;t get got.
        </p>
      </Card>

      <ol className="grid grid-cols-3 gap-2 text-center">
        {[
          ['1', 'Join with a code', 'bg-pink'],
          ['2', 'Get a secret mission', 'bg-mint'],
          ['3', 'Be the last alive', 'bg-blue'],
        ].map(([n, text, bg]) => (
          <li key={n} className={`rounded-xl brut p-2 shadow-hard-sm ${bg}`}>
            <div className="font-display text-2xl">{n}</div>
            <div className="text-sm leading-tight font-bold">{text}</div>
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
        <a
          href="https://last-alive-site.vercel.app/"
          className="inline-flex min-h-11 items-center justify-center label-mono underline"
        >
          New here? How to play →
        </a>
      </div>
    </main>
  )
}
