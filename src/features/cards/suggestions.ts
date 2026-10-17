export const CARD_KINDS = ['weapon', 'place', 'phrase'] as const
export type CardKind = (typeof CARD_KINDS)[number]

export const CARD_COPY: Record<
  CardKind,
  { label: string; hint: string; placeholder: string; maxLength: number }
> = {
  weapon: {
    label: 'Weapon',
    hint: 'An everyday object the hunter tags them with.',
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
  weapon: ['Wooden spoon', 'Sock', 'Banana', 'Post-it note', 'Teaspoon', 'Pool noodle', 'Feather'],
  place: ['Kitchen', 'Lift', 'Car park', 'Staircase', 'Bus stop', 'Garden', 'Front door'],
  phrase: [
    'The eagle has landed',
    'Nothing personal',
    'Tag, you’re it',
    'Sweet dreams',
    'Checkmate',
    'I’ll be back',
    'You never saw me',
  ],
}
