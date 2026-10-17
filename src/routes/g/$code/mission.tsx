import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/g/$code/mission')({
  component: () => <p className="label-mono">Coming soon</p>,
})
