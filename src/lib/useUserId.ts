import { useRouteContext } from '@tanstack/react-router'

/** The anonymous auth uid of this device. */
export function useUserId(): string {
  return useRouteContext({ from: '__root__', select: (c) => c.userId })
}
