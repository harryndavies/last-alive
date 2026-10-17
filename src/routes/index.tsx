import { createFileRoute } from '@tanstack/react-router'
import { Button, Card, Tag } from '@/components'

export const Route = createFileRoute('/')({
  component: Landing,
})

function Landing() {
  return (
    <main className="flex flex-col gap-6 pt-8">
      <Tag tone="red" tilt className="self-start">
        Top secret
      </Tag>
      <h1 className="text-6xl">Last Alive</h1>
      <Card tone="yellow" tilt={-1}>
        <p className="text-lg font-medium">The real-life assassin game.</p>
      </Card>
      <Button size="lg" block>
        New game
      </Button>
    </main>
  )
}
