import { Button, Card, Tag } from '@/components'

/**
 * iPhone Safari only: notifications need the home-screen app, and that app
 * starts with a fresh session. Installing before joining means you join once,
 * in the right place. The manifest has no start_url, so the home-screen app
 * opens on this join page with the code already in it.
 */
export function InstallFirst({ onSkip }: { onSkip: () => void }) {
  return (
    <Card tone="pink" tilt={-1} className="flex flex-col gap-3">
      <Tag tone="ink" className="self-start">
        On iPhone? Do this first
      </Tag>
      <p className="font-bold">
        Add Last Alive to your home screen before you join, so you get pinged when someone says they
        got you.
      </p>
      <ol className="list-decimal space-y-1 pl-5 font-medium">
        <li>
          Tap <strong>Share</strong> <span aria-hidden="true">(□↑)</span> below.
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong>.
        </li>
        <li>Open Last Alive from your home screen and join from there.</li>
      </ol>
      <Button variant="paper" block onClick={onSkip}>
        Skip, join in Safari
      </Button>
    </Card>
  )
}
