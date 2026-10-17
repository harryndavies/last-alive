export const CARD_KINDS = ['weapon', 'place', 'object'] as const
export type CardKind = (typeof CARD_KINDS)[number]

export const CARD_COPY: Record<CardKind, { label: string; hint: string; placeholder: string }> = {
  weapon: {
    label: 'Weapon',
    hint: 'Something harmless you tag them with.',
    placeholder: 'A rubber duck',
  },
  place: {
    label: 'Place',
    hint: 'Where the hit has to happen.',
    placeholder: 'The kitchen',
  },
  object: {
    label: 'Object',
    hint: 'Must be in shot. Bonus, not required.',
    placeholder: 'A mug',
  },
}

export const SUGGESTIONS: Record<CardKind, readonly string[]> = {
  weapon: ['Wooden spoon', 'Sock', 'Banana', 'Post-it note', 'Teaspoon', 'Pool noodle', 'Feather'],
  place: ['Kitchen', 'Lift', 'Car park', 'Staircase', 'Bus stop', 'Garden', 'Front door'],
  object: ['Mug', 'Umbrella', 'Plant', 'Hat', 'Phone charger', 'Biscuit', 'Remote control'],
}
