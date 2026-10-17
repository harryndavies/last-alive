import { useState } from 'react'
import { safeStorage } from '@/lib/storage'

const KEY = 'last-alive:mission-revealed'

/** Hide/reveal toggle for the mission, remembered on this device. Hidden by default. */
export function useReveal(): [boolean, () => void] {
  const [revealed, setRevealed] = useState(() => safeStorage.get(KEY) === '1')
  const toggle = () =>
    setRevealed((r) => {
      safeStorage.set(KEY, r ? '0' : '1')
      return !r
    })
  return [revealed, toggle]
}
