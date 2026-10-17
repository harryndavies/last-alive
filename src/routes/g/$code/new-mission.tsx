import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/g/$code/new-mission')({
  component: () => <p className="label-mono">Coming soon</p>,
})
