const MESSAGES: Record<string, string> = {
  not_signed_in: 'Your session expired. Refresh the page to continue.',
  game_not_found: 'No game with that code. Check it and try again.',
  not_in_game: 'You are not in this game.',
  name_taken: 'Someone in this game already has that name.',
  game_already_started: 'This game has already started.',
  game_full: 'This game is full.',
  invalid_name: 'Names need 1 to 20 characters.',
  invalid_game_name: 'Game names can be up to 40 characters.',
  invalid_colour: 'Pick a colour.',
  player_not_found: 'Nobody in this game has that name.',
  already_seated: 'This device already has a seat in this game.',
  wrong_pin: 'That PIN is wrong.',
  pin_locked: 'Too many wrong PINs. Try again in 15 minutes.',
  not_host: 'Only the host can do that.',
  wrong_phase: 'The game has moved on. Refreshing…',
  need_four_players: 'You need at least 4 players.',
  cards_already_locked: 'Your cards are already locked in.',
  invalid_card: 'Each card needs 2 to 60 characters.',
  cards_not_locked: 'Not everyone has locked in their cards yet.',
  not_enough_players: 'Not enough players to start.',
  not_enough_cards: 'Not enough cards to deal missions.',
  could_not_deal_cards: 'Could not deal the cards. Try starting again.',
  you_are_dead: 'You are out of the game.',
  not_your_target: 'That person is not your target.',
  note_too_long: 'Notes can be up to 200 characters.',
  kill_not_found: 'That claim no longer exists.',
  not_your_kill: 'That claim is not about you.',
  kill_not_pending: 'That claim has already been answered.',
  kill_not_disputed: 'That dispute has already been resolved.',
  cannot_remove_self: 'You cannot remove yourself. Leave the game instead.',
  not_allowed: 'You cannot do that.',
  invalid_photo: 'That photo could not be used. Try again.',
  invalid_reaction: 'That reaction is not available.',
  invalid_comment: 'Comments need 1 to 200 characters.',
  slow_down: 'Easy, tiger. Wait a few seconds between comments.',
  end_too_soon: 'The end time needs to be at least an hour from now.',
  can_only_extend: 'Once the game has started you can only make it longer.',
  times_up: 'Time is up. No new kills can be claimed.',
  claim_already_open: 'You already have a claim waiting for an answer.',
}

/** An error from one of our RPCs, carrying the short code the database raised. */
export class GameError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? 'Something went wrong. Try again.')
    this.code = code
    this.name = 'GameError'
  }
}

export function toGameError(error: { message: string } | null | undefined): GameError {
  const code = error?.message?.trim() ?? 'unknown'
  return new GameError(code in MESSAGES ? code : 'unknown', MESSAGES[code] ?? error?.message)
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Try again.'
}
