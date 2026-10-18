export const CARD_KINDS = ['weapon', 'place', 'phrase'] as const
export type CardKind = (typeof CARD_KINDS)[number]

export const CARD_COPY: Record<
  CardKind,
  { label: string; hint: string; placeholder: string; maxLength: number }
> = {
  weapon: {
    label: 'Weapon',
    hint: 'Anything at all. The target has to take it from the hunter.',
    maxLength: 60,
    placeholder: 'A rubber duck',
  },
  place: {
    label: 'Place',
    hint: 'Where the hit has to happen.',
    maxLength: 60,
    placeholder: 'The kitchen',
  },
  phrase: {
    label: 'Phrase',
    hint: 'What the hunter has to say once they have got them.',
    placeholder: 'The eagle has landed',
    maxLength: 80,
  },
}

export const SUGGESTIONS: Record<CardKind, readonly string[]> = {
  weapon: ['Pen', 'Biscuit', 'Cup of tea', 'Banana', 'Post-it note', 'Teaspoon', 'Sock'],
  place: ['Kitchen', 'Lift', 'Car park', 'Staircase', 'Bus stop', 'Garden', 'Front door'],
  phrase: [
    'The eagle has landed',
    'Nothing personal',
    'You’ve been served',
    'Sweet dreams',
    'Checkmate',
    'I’ll be back',
    'You never saw me',
  ],
}
