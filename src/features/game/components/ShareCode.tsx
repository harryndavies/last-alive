import { useState } from 'react'
import { Button, Card } from '@/components'

export function ShareCode({ code, gameName }: { code: string; gameName: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/join/${code}`

  async function share() {
    const text = `Join "${gameName}" on Last Alive with code ${code}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Last Alive', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text}: ${url}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Share sheet dismissed: nothing to do.
    }
  }

  return (
    <Card tone="yellow" tilt={-2} className="flex flex-col items-center gap-3 text-center">
      <p className="label-mono">Game code</p>
      <p className="font-display text-[clamp(2rem,11vw,3rem)] tracking-wide whitespace-nowrap select-all">
        {code}
      </p>
      <Button variant="paper" onClick={() => void share()} aria-live="polite">
        {copied ? 'Link copied!' : 'Share invite'}
      </Button>
    </Card>
  )
}
