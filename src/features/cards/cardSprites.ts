import type { SPRITES } from '@/components/Sprite'
import type { CardKind } from './suggestions'

/** The pixel icon for each card, and a width that makes them look the same size. */
export const CARD_SPRITE: Record<CardKind, { name: keyof typeof SPRITES; width: string }> = {
  weapon: { name: 'hand', width: 'w-16' },
  place: { name: 'pin', width: 'w-7' },
  phrase: { name: 'bubble', width: 'w-14' },
}
