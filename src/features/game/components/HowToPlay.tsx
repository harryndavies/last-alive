import { Card, Sprite, Tag } from '@/components'
import type { SPRITES } from '@/components/Sprite'
import { useCopy } from '@/lib/theme'

type Tone = 'yellow' | 'mint' | 'pink' | 'blue'

/** The rules in four swipeable cards. Shown in the lobby and from the home page. */
export function HowToPlay({ heading = true }: { heading?: boolean }) {
  const copy = useCopy()
  const steps: { tone: Tone; title: string; body: string; sprite: keyof typeof SPRITES }[] = [
    {
      tone: 'yellow',
      sprite: 'envelope',
      title: 'Your mission',
      body: 'Once the game starts you get a secret target and three cards: something to hand over, where to do it, and a line to say.',
    },
    {
      tone: 'mint',
      sprite: 'hand',
      title: 'Get them',
      body: `Get your target to take the object from you, in that place, while you say the line. Then tap “${copy.iGotThem}”`,
    },
    {
      tone: 'pink',
      sprite: 'eyes',
      title: 'Watch your back',
      body: 'Someone is hunting you too. Think twice before taking anything. Catch your hunter in the act? Call them out and they’re out.',
    },
    {
      tone: 'blue',
      sprite: 'gravestone',
      title: 'Got got?',
      body: 'Confirm it on your phone. Whoever got you takes over your mission. Last one alive wins.',
    },
  ]
  return (
    <section aria-labelledby={heading ? 'how-heading' : undefined} className="flex flex-col gap-3">
      <div className={heading ? 'flex items-baseline justify-between' : 'flex justify-end'}>
        {heading && (
          <h2 id="how-heading" className="text-2xl">
            How to play
          </h2>
        )}
        <span className="label-mono text-muted">Swipe →</span>
      </div>
      <ol className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {steps.map((s, i) => (
          <li key={s.title} className="w-[80%] shrink-0 snap-center">
            <Card tone={s.tone} className="flex h-full flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <Tag tone="ink">
                  {i + 1} of {steps.length}
                </Tag>
                <Sprite name={s.sprite} className="h-12 w-auto" />
              </div>
              <h3 className="text-2xl">{s.title}</h3>
              <p className="font-medium">{s.body}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  )
}
