import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/g/$code/cards')({
  component: () => <p className="label-mono">Coming soon</p>,
})
